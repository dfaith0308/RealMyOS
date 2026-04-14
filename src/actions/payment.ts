'use server'

import { revalidatePath } from 'next/cache'
import { linkActionResult } from '@/actions/action-log'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export type PaymentMethod = 'transfer' | 'cash' | 'card' | 'platform'

export interface CreatePaymentInput {
  customer_id:              string
  amount:                   number
  payment_date:             string
  payment_method:           PaymentMethod
  memo?:                    string
  collection_schedule_id?:  string | null
}

export interface CreatePaymentResult {
  id:             string
  applied_amount: number
  deposit_amount: number
  balance_before: number
  mode:           'rpc' | 'fallback'   // 어떤 경로로 저장됐는지
  warning?:       string
}

// ============================================================
// 수금 등록
// 우선순위: create_payment_atomic RPC → direct insert fallback
// RPC 실패 시에도 direct insert로 항상 저장 보장
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
    .eq('tenant_id', ctx.tenant_id)
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
  })

  // RPC 성공 여부 판단 — 에러 없고 data 존재
  const rpcOk = !rpcErr && rpcData != null
  if (!rpcOk) {
    console.error('[createPayment] RPC 결과:', {
      error:   rpcErr?.message ?? 'none',
      code:    rpcErr?.code ?? 'none',
      hasData: !!rpcData,
    })
  }

  if (rpcOk) {
    // RPC 성공
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
        deposit_amount: rpcData.deposit_amount as number,
        balance_before: rpcData.balance_before as number,
        mode:           'rpc',
        warning:        dupWarning,
      },
    }
  }

  // ── 2차 시도: direct insert fallback (RPC 미존재 또는 에러) ──
  console.error('[createPayment] RPC 실패 — fallback insert 시도')

  const { data: inserted, error: insertErr } = await supabase
    .from('payments')
    .insert({
      tenant_id:      ctx.tenant_id,
      customer_id:    input.customer_id,
      amount:         input.amount,
      deposit_amount: 0,               // fallback: deposit 계산 생략, 정합성은 ledger에서
      payment_date:   input.payment_date,
      payment_method: input.payment_method,
      memo:           input.memo ?? null,
      status:         'confirmed',     // 반드시 confirmed — ledger 집계 기준
      created_by:     ctx.user_id,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('[createPayment] fallback insert 실패:', insertErr?.message)
    return {
      success: false,
      error:   `수금 저장 실패: ${insertErr?.message ?? rpcErr?.message ?? '알 수 없는 오류'}`,
    }
  }

  // collection_schedule 완료 처리 (fallback에서도 처리)
  if (input.collection_schedule_id) {
    await supabase
      .from('collection_schedules')
      .update({ status: 'done' })
      .eq('id', input.collection_schedule_id)
      .eq('tenant_id', ctx.tenant_id)
  }

  await linkActionResult({
    customer_id:        input.customer_id,
    tenant_id:          ctx.tenant_id,
    result_type:        'payment_completed',
    result_amount:      input.amount,
    related_payment_id: inserted.id,
  }).catch(() => {})

  revalidatePath('/customers')
  revalidatePath('/payments/new')

  return {
    success: true,
    data: {
      id:             inserted.id,
      applied_amount: input.amount,
      deposit_amount: 0,
      balance_before: 0,
      mode:           'fallback',
      warning:        dupWarning,
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
    .eq('tenant_id', ctx.tenant_id)
    .single()

  if (!payment)                       return { success: false, error: '수금 내역을 찾을 수 없습니다.' }
  if (payment.status === 'cancelled') return { success: false, error: '이미 취소된 수금입니다.' }

  // 2. status → cancelled (ledger 집계에서 자동 제외됨)
  const { error } = await supabase
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('id', payment_id)
    .eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/customers')
  revalidatePath('/payments/new')
  return { success: true }
}

// ============================================================
// 잔액 + 예치금 조회 (UI 표시용)
// 공식: opening_balance + confirmed주문 - confirmed수금
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

  const [{ data: orderRows }, { data: paymentRows }] = await Promise.all([
    supabase.from('orders')
      .select('final_amount, total_amount')
      .eq('customer_id', customer_id).eq('tenant_id', ctx.tenant_id)
      .eq('status', 'confirmed').is('deleted_at', null),
    supabase.from('payments')
      .select('amount, deposit_amount')
      .eq('customer_id', customer_id).eq('tenant_id', ctx.tenant_id)
      .eq('status', 'confirmed'),
  ])

  const totalOrders   = (orderRows   ?? []).reduce((s, o) => s + (o.final_amount ?? o.total_amount), 0)
  const totalPayments = (paymentRows ?? []).reduce((s, p) => s + p.amount,                           0)
  const totalDeposit  = (paymentRows ?? []).reduce((s, p) => s + (p.deposit_amount ?? 0),            0)
  const balance       = (customer.opening_balance ?? 0) + totalOrders - totalPayments

  return { success: true, data: { balance, deposit: totalDeposit, customer_name: customer.name } }
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
    .eq('tenant_id', ctx.tenant_id)
    .order('payment_date', { ascending: false })
    .order('created_at',   { ascending: false })
    .limit(500)

  if (filters?.from)        query = query.gte('payment_date', filters.from)
  if (filters?.to)          query = query.lte('payment_date', filters.to)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)
  if (filters?.status)      query = query.eq('status', filters.status)
  else                      query = query.in('status', ['confirmed', 'cancelled'])

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