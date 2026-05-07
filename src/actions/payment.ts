'use server'

import { revalidatePath } from 'next/cache'
import { linkActionResult } from '@/actions/action-log'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import { effectiveOrderAmount, getAccountsReceivable, getCustomerDeposit } from '@/lib/ledger-calc'

export type PaymentMethod = 'transfer' | 'cash' | 'card' | 'platform'

export interface CreatePaymentInput {
  customer_id:              string
  amount:                   number
  payment_date:             string
  payment_method:           PaymentMethod
  memo?:                    string
  collection_schedule_id?:  string | null
  order_id?:                string | null   // 주문과 함께 처리 시 연결
}

export interface CreatePaymentResult {
  id:             string
  applied_amount: number
  deposit_amount: number
  balance_before: number
  mode:           'rpc'
  warning?:       string
}

// ============================================================
// 수금 등록
// 우선순위: create_payment_atomic RPC
// ============================================================

export async function createPayment(
  input: CreatePaymentInput,
): Promise<ActionResult<CreatePaymentResult>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  if (!input.customer_id)
    return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount))
    return { success: false, error: '유효한 금액을 입력해주세요. (양의 정수)' }

  // 중복 수금 감지 (2분 내 동일 customer + 동일 amount)
  let dupWarning: string | undefined
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recentPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('customer_id', input.customer_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('direction', 'inbound')
    .eq('amount', input.amount)
    .eq('status', 'confirmed')
    .gte('created_at', twoMinsAgo)
    .limit(1)
    .maybeSingle()
  if (recentPayment) {
    dupWarning = `최근 동일 금액(${input.amount.toLocaleString()}원)의 수금이 등록되어 있습니다. 중복인지 확인하세요.`
  }

  // ── 1차 시도: RPC (balance 계산 + deposit 분리 + insert 단일 트랜잭션) ──
  const { data: rpcData, error: rpcErr } = await supabase.rpc('create_payment_atomic', {
    p_tenant_id:               ctx.tenant_id,
    p_customer_id:             input.customer_id,
    p_amount:                  input.amount,
    p_payment_date:            input.payment_date,
    p_payment_method:          input.payment_method,
    p_memo:                    input.memo ?? null,
    p_created_by:              ctx.user_id,
    p_collection_schedule_id:  input.collection_schedule_id ?? null,
    p_order_id:                input.order_id ?? null,
  })

  if (rpcErr) {
    return { success: false, error: rpcErr.message }
  }
  if (rpcData == null) {
    return { success: false, error: '수금 저장 실패: RPC 응답이 비어있습니다.' }
  }

  // 예치금 반영 (SUP-MISSING-007)
  // - create_payment_atomic이 계산한 deposit_amount를 SSOT로 보고, customer_deposits/deposit_logs에 기록
  // - 실패 시 수금 자체를 실패로 만들지 않고 warning으로 반환 (회계상 수동 점검 가능하도록)
  let depositWarning: string | undefined
  const deposit_amount = (rpcData.deposit_amount as number | null) ?? 0
  if (deposit_amount > 0) {
    try {
      const { data: depRow, error: depErr } = await supabase
        .from('customer_deposits')
        .select('id, balance')
        .eq('tenant_id', ctx.tenant_id)
        .eq('customer_id', input.customer_id)
        .maybeSingle()

      if (depErr) throw new Error(depErr.message)

      const before = depRow?.balance ?? 0
      const after = before + deposit_amount

      if (!depRow) {
        const { error: insErr } = await supabase.from('customer_deposits').insert({
          tenant_id: ctx.tenant_id,
          customer_id: input.customer_id,
          balance: after,
          updated_at: new Date().toISOString(),
        })
        if (insErr) throw new Error(insErr.message)
      } else {
        const { error: upErr } = await supabase
          .from('customer_deposits')
          .update({ balance: after, updated_at: new Date().toISOString() })
          .eq('tenant_id', ctx.tenant_id)
          .eq('id', depRow.id)
        if (upErr) throw new Error(upErr.message)
      }

      const { error: logErr } = await supabase.from('deposit_logs').insert({
        tenant_id: ctx.tenant_id,
        customer_id: input.customer_id,
        amount: deposit_amount,
        type: 'credit',
        reason: 'payment_over',
        payment_id: rpcData.id as string,
      })

      if (logErr) {
        // 롤백(가능한 범위): balance 복구
        if (depRow) {
          await supabase
            .from('customer_deposits')
            .update({ balance: before, updated_at: new Date().toISOString() })
            .eq('tenant_id', ctx.tenant_id)
            .eq('id', depRow.id)
        } else {
          await supabase
            .from('customer_deposits')
            .update({ balance: 0, updated_at: new Date().toISOString() })
            .eq('tenant_id', ctx.tenant_id)
            .eq('customer_id', input.customer_id)
        }
        throw new Error(logErr.message)
      }

      revalidatePath('/payments/new')
      revalidatePath('/customers')
      revalidatePath(`/customers/${input.customer_id}/ledger`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      depositWarning = `예치금 기록 실패(수금은 저장됨): ${msg}`
    }
  }

  // FIFO 자동 배분 (best-effort): 배분 실패해도 수금 자체는 성공 유지
  try {
    await supabase.rpc('allocate_payment_fifo', {
      p_tenant_id:  ctx.tenant_id,
      p_payment_id: rpcData.id as string,
    })
  } catch { /* noop */ }

  await linkActionResult({
    customer_id:        input.customer_id,
    tenant_id:          ctx.tenant_id,
    result_type:        'payment_completed',
    result_amount:      input.amount,
    related_payment_id: rpcData.id as string,
  }).catch(() => {})  // action_log 실패는 수금 성공에 영향 없음

  revalidatePath('/customers')
  revalidatePath('/payments/new')

  return {
    success: true,
    data: {
      id:             rpcData.id             as string,
      applied_amount: rpcData.applied_amount as number,
      deposit_amount: deposit_amount,
      balance_before: rpcData.balance_before as number,
      mode:           'rpc',
      warning:        [dupWarning, depositWarning].filter(Boolean).join(' · ') || undefined,
    },
  }
}

// ============================================================
// 수금 취소 — status='cancelled'만 변경 (delete 금지)
// ledger가 confirmed만 집계하므로 취소 시 자동으로 잔액 원복
// ============================================================

export async function cancelPayment(payment_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 1. payment 조회 + tenant 보호
  const { data: payment } = await supabase
    .from('payments')
    .select('id, status, tenant_id, customer_id, amount')
    .eq('id', payment_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .single()

  if (!payment)                       return { success: false, error: '수금 내역을 찾을 수 없습니다.' }
  if (payment.status === 'reversed') return { success: false, error: '이미 취소된 수금입니다.' }

  // 2. status → reversed (ledger 집계에서 자동 제외됨)
  const { error } = await supabase
    .from('payments')
    .update({ status: 'reversed' })
    .eq('id', payment_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)

  if (error) return { success: false, error: error.message }

  revalidatePath('/customers')
  revalidatePath('/payments/new')
  return { success: true }
}

// ============================================================
// 잔액 + 예치금 조회 (UI 표시용)
// 미수: getAccountsReceivable / 예치: customer_deposits.balance
// ============================================================

export async function getCustomerBalance(
  customer_id: string,
): Promise<ActionResult<{ balance: number; deposit: number; customer_name: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처 없음' }

  const [{ data: orderRows }, { data: paymentRows }, { data: depRow }] = await Promise.all([
    supabase.from('orders')
      .select('final_amount, total_amount')
      .eq('customer_id', customer_id)
      // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .eq('status', 'confirmed').is('deleted_at', null),
    supabase.from('payments')
      .select('amount')
      .eq('customer_id', customer_id)
      // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
      .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .eq('direction', 'inbound')
      .eq('status', 'confirmed'),
    supabase.from('customer_deposits')
      .select('balance')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', customer_id)
      .maybeSingle(),
  ])

  const totalOrders   = (orderRows   ?? []).reduce((s, o) => s + effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number }), 0)
  const totalPayments = (paymentRows ?? []).reduce((s, p) => s + p.amount, 0)
  const balance       = getAccountsReceivable(customer.opening_balance ?? 0, totalOrders, totalPayments, 0)
  const deposit       = getCustomerDeposit((depRow as { balance?: number | null } | null)?.balance)

  return { success: true, data: { balance, deposit, customer_name: customer.name } }
}

// ============================================================
// 수금 상세 + 배분 (SUP-MISSING-006)
// ============================================================

export interface PaymentDetail {
  id: string
  payment_date: string
  customer_id: string
  customer_name: string
  amount: number
  deposit_amount: number
  payment_method: string
  memo: string | null
  status: string
  created_at: string
}

export async function getPaymentDetail(payment_id: string): Promise<ActionResult<PaymentDetail>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_date, customer_id, amount, deposit_amount, payment_method, memo, status, created_at, customers(name)')
    .eq('id', payment_id)
    .eq('direction', 'inbound')
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: '수금 내역을 찾을 수 없습니다.' }

  return {
    success: true,
    data: {
      id: data.id,
      payment_date: data.payment_date,
      customer_id: data.customer_id,
      customer_name: (data.customers as any)?.name ?? '-',
      amount: data.amount,
      deposit_amount: data.deposit_amount ?? 0,
      payment_method: data.payment_method,
      memo: data.memo,
      status: data.status,
      created_at: data.created_at,
    },
  }
}

export interface PaymentAllocationRow {
  id: string
  order_id: string
  order_date: string
  order_amount: number
  allocated_amount: number
  status: 'active' | 'voided'
  created_at: string
  voided_at: string | null
  voided_reason: string | null
}

export async function getPaymentAllocations(
  payment_id: string,
): Promise<ActionResult<PaymentAllocationRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // payment scope check (존재/tenant 보호)
  const payment = await getPaymentDetail(payment_id)
  if (!payment.success || !payment.data) return payment as any

  const { data, error } = await supabase
    .from('collection_allocations')
    .select(`
      id,
      order_id,
      allocated_amount,
      status,
      created_at,
      voided_at,
      voided_reason,
      orders!inner(order_date, total_amount, final_amount)
    `)
    .eq('tenant_id', ctx.tenant_id)
    .eq('payment_id', payment_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      order_date: (r.orders as any)?.order_date ?? '-',
      order_amount: effectiveOrderAmount(r.orders as any),
      allocated_amount: r.allocated_amount,
      status: (r.status ?? 'active') as 'active' | 'voided',
      created_at: r.created_at,
      voided_at: r.voided_at ?? null,
      voided_reason: r.voided_reason ?? null,
    })),
  }
}

export interface OpenOrderForAllocation {
  order_id: string
  order_date: string
  order_amount: number
  already_allocated: number
  remaining: number
}

export async function getCustomerOpenOrdersForAllocation(
  customer_id: string,
): Promise<ActionResult<OpenOrderForAllocation[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_date, total_amount, final_amount')
    .eq('customer_id', customer_id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: true })
    .limit(500)

  if (oErr) return { success: false, error: oErr.message }

  const orderRows = (orders ?? []).map((o: any) => ({
    order_id: o.id as string,
    order_date: o.order_date as string,
    order_amount: effectiveOrderAmount(o),
  }))

  const ids = orderRows.map((o) => o.order_id)
  const allocByOrder = new Map<string, number>()

  if (ids.length > 0) {
    const { data: allocs, error: aErr } = await supabase
      .from('collection_allocations')
      .select('order_id, allocated_amount, status')
      .eq('tenant_id', ctx.tenant_id)
      .in('order_id', ids)
      .eq('status', 'active')

    if (aErr) return { success: false, error: aErr.message }

    for (const a of allocs ?? []) {
      allocByOrder.set(a.order_id, (allocByOrder.get(a.order_id) ?? 0) + a.allocated_amount)
    }
  }

  const out: OpenOrderForAllocation[] = []
  for (const o of orderRows) {
    const already_allocated = allocByOrder.get(o.order_id) ?? 0
    const remaining = o.order_amount - already_allocated
    if (remaining > 0) {
      out.push({ ...o, already_allocated, remaining })
    }
  }

  return { success: true, data: out }
}

export async function allocatePaymentFifo(payment_id: string): Promise<ActionResult<{ status: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('allocate_payment_fifo', {
    p_tenant_id: ctx.tenant_id,
    p_payment_id: payment_id,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath(`/payments/${payment_id}`)
  revalidatePath('/payments')
  return { success: true, data: { status: (data as any)?.status ?? 'ok' } }
}

export async function addPaymentAllocation(input: {
  payment_id: string
  order_id: string
  allocated_amount: number
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.allocated_amount || input.allocated_amount <= 0 || !Number.isInteger(input.allocated_amount)) {
    return { success: false, error: '배분 금액은 양의 정수여야 합니다.' }
  }

  // payment scope + customer_id 확보
  const payRes = await getPaymentDetail(input.payment_id)
  if (!payRes.success || !payRes.data) return payRes as any
  if (payRes.data.status !== 'confirmed') {
    return { success: false, error: '정상(confirmed) 수금만 배분할 수 있습니다.' }
  }

  // order scope + 동일 customer 검증
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, customer_id, final_amount, total_amount, status, deleted_at')
    .eq('id', input.order_id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!order || order.deleted_at) return { success: false, error: '주문을 찾을 수 없습니다.' }
  if (order.status !== 'confirmed') return { success: false, error: '확정(confirmed) 주문만 배분할 수 있습니다.' }
  if (order.customer_id !== payRes.data.customer_id) {
    return { success: false, error: '수금 거래처와 주문 거래처가 일치하지 않습니다.' }
  }

  // 남은 배분 가능 금액 검증 (현재 payment 기준)
  const [{ data: allocSum }, { data: orderAllocSum }] = await Promise.all([
    supabase
      .from('collection_allocations')
      .select('allocated_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('payment_id', input.payment_id)
      .eq('status', 'active'),
    supabase
      .from('collection_allocations')
      .select('allocated_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('order_id', input.order_id)
      .eq('status', 'active'),
  ])

  const paymentAllocated = (allocSum ?? []).reduce((s: number, r: any) => s + r.allocated_amount, 0)
  const paymentRemaining = payRes.data.amount - paymentAllocated
  if (paymentRemaining <= 0) return { success: false, error: '이미 전액 배분되었습니다.' }
  if (input.allocated_amount > paymentRemaining) return { success: false, error: '배분 금액이 미배분 금액을 초과합니다.' }

  const orderAllocated = (orderAllocSum ?? []).reduce((s: number, r: any) => s + r.allocated_amount, 0)
  const orderAmount = effectiveOrderAmount(order as any)
  const orderRemaining = orderAmount - orderAllocated
  if (orderRemaining <= 0) return { success: false, error: '해당 주문은 이미 전액 수금 처리되었습니다.' }
  if (input.allocated_amount > orderRemaining) return { success: false, error: '배분 금액이 주문 미수금을 초과합니다.' }

  // 기존 allocation 존재 시 update(+=), 없으면 insert. (1 write)
  const { data: existing } = await supabase
    .from('collection_allocations')
    .select('id, allocated_amount, status')
    .eq('tenant_id', ctx.tenant_id)
    .eq('payment_id', input.payment_id)
    .eq('order_id', input.order_id)
    .maybeSingle()

  if (!existing) {
    const { error: insErr } = await supabase
      .from('collection_allocations')
      .insert({
        tenant_id: ctx.tenant_id,
        payment_id: input.payment_id,
        order_id: input.order_id,
        allocated_amount: input.allocated_amount,
        status: 'active',
      })
    if (insErr) return { success: false, error: insErr.message }
  } else {
    const nextAmount = (existing.allocated_amount ?? 0) + input.allocated_amount
    const { error: upErr } = await supabase
      .from('collection_allocations')
      .update({
        allocated_amount: nextAmount,
        status: 'active',
        voided_at: null,
        voided_reason: null,
      })
      .eq('id', existing.id)
      .eq('tenant_id', ctx.tenant_id)
    if (upErr) return { success: false, error: upErr.message }
  }

  revalidatePath(`/payments/${input.payment_id}`)
  revalidatePath('/payments')
  return { success: true }
}

export async function voidPaymentAllocation(input: {
  allocation_id: string
  reason?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const reason = (input.reason ?? 'manual_void').slice(0, 120)

  const { data: row, error: exErr } = await supabase
    .from('collection_allocations')
    .select('id, payment_id, status')
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', input.allocation_id)
    .maybeSingle()

  if (exErr) return { success: false, error: exErr.message }
  if (!row) return { success: false, error: '배분 내역을 찾을 수 없습니다.' }
  if (row.status === 'voided') return { success: true }

  const { error: upErr } = await supabase
    .from('collection_allocations')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_reason: reason,
    })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', input.allocation_id)

  if (upErr) return { success: false, error: upErr.message }

  revalidatePath(`/payments/${row.payment_id}`)
  revalidatePath('/payments')
  return { success: true }
}

// ============================================================
// 수금 목록 조회
// ============================================================

export interface PaymentListItem {
  id:             string
  payment_date:   string
  customer_id:    string
  customer_name:  string
  amount:         number
  deposit_amount: number
  payment_method: string
  memo:           string | null
  status:         string
  created_at:     string
}

export async function getPaymentList(filters?: {
  from?:        string
  to?:          string
  customer_id?: string
  status?:      string
}): Promise<ActionResult<PaymentListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('payments')
    .select('id, payment_date, customer_id, amount, deposit_amount, payment_method, memo, status, created_at, customers(id, name)')
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('direction', 'inbound')
    .order('payment_date', { ascending: false })
    .order('created_at',   { ascending: false })
    .limit(500)

  if (filters?.from)        query = query.gte('payment_date', filters.from)
  if (filters?.to)          query = query.lte('payment_date', filters.to)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)
  if (filters?.status)      query = query.eq('status', filters.status)
  else                      query = query.in('status', ['confirmed', 'reversed'])

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((p: any) => ({
      id:             p.id,
      payment_date:   p.payment_date,
      customer_id:    p.customer_id,
      customer_name:  (p.customers as any)?.name ?? '-',
      amount:         p.amount,
      deposit_amount: p.deposit_amount ?? 0,
      payment_method: p.payment_method,
      memo:           p.memo,
      status:         p.status,
      created_at:     p.created_at,
    })),
  }
}

// ============================================================
// 지급 목록 조회 (outbound, RULE-01)
// ============================================================

export interface DisbursementListItem {
  id:                 string
  counterparty_name:  string | null
  amount:             number
  due_date:           string | null
  status:             string
  payment_method:     string
  order_id:           string | null
  memo:               string | null
  created_at:         string
}

export async function getDisbursementList(filters?: {
  status?: string
}): Promise<ActionResult<DisbursementListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('payments')
    .select('id, counterparty_name, amount, due_date, status, payment_method, order_id, memo, created_at')
    .eq('direction', 'outbound')
    .or(`payer_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(50)

  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((p) => ({
      id:                p.id,
      counterparty_name: p.counterparty_name,
      amount:            p.amount,
      due_date:          p.due_date,
      status:            p.status,
      payment_method:    p.payment_method,
      order_id:          p.order_id,
      memo:              p.memo,
      created_at:        p.created_at,
    })),
  }
}

// ============================================================
// 지급 등록 + 분배 (outbound, RULE-19 → RPC 단일 트랜잭션)
// ============================================================

export interface DisbursementAllocationInput {
  purchase_id?:      string | null
  allocated_amount:  number
}

export interface CreateDisbursementInput {
  counterparty_name: string
  amount:            number
  payment_date:      string
  payment_method:    PaymentMethod
  due_date:          string | null
  memo?:             string | null
  order_id?:         string | null
  allocations:       DisbursementAllocationInput[]
}

export async function createDisbursement(
  input: CreateDisbursementInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.counterparty_name?.trim())
    return { success: false, error: '매입처명을 입력해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount))
    return { success: false, error: '지급 금액은 양의 정수여야 합니다.' }

  const allocations = (input.allocations ?? []).filter((a) => a.allocated_amount > 0)
  const sumAlloc = allocations.reduce((s, a) => s + a.allocated_amount, 0)
  if (sumAlloc > input.amount)
    return { success: false, error: '분배 합계가 지급 금액을 초과할 수 없습니다.' }

  const payload = allocations.map((a) => ({
    purchase_id:      a.purchase_id && a.purchase_id.length > 0 ? a.purchase_id : null,
    allocated_amount: a.allocated_amount,
  }))

  const { data: paymentId, error } = await supabase.rpc('create_disbursement_with_allocations', {
    p_tenant_id:         ctx.tenant_id,
    p_counterparty_name: input.counterparty_name.trim(),
    p_amount:            input.amount,
    p_payment_date:      input.payment_date,
    p_payment_method:    input.payment_method,
    p_due_date:          input.due_date,
    p_memo:              input.memo ?? null,
    p_order_id:          input.order_id ?? null,
    p_created_by:        ctx.user_id,
    p_allocations:       payload,
  })

  if (error) return { success: false, error: error.message }
  if (!paymentId) return { success: false, error: '지급 저장 실패: RPC 응답 없음' }

  revalidatePath('/disbursements')
  revalidatePath('/disbursements/new')

  return { success: true, data: { id: paymentId as string } }
}

// ============================================================
// 지급 취소 — reverse_disbursement RPC (RULE-10/11/19/20)
// ============================================================

export async function cancelDisbursement(payment_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase.rpc('reverse_disbursement', {
    p_tenant_id:  ctx.tenant_id,
    p_payment_id: payment_id,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/disbursements')
  revalidatePath('/purchases')

  return { success: true }
}