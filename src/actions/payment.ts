'use server'

import { revalidatePath } from 'next/cache'
import { linkActionResult } from '@/actions/action-log'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export type PaymentMethod = 'transfer' | 'cash' | 'card' | 'platform'

export interface CreatePaymentInput {
  customer_id:    string
  amount:         number
  payment_date:   string
  payment_method: PaymentMethod
  memo?:          string
}

export interface CreatePaymentResult {
  id:             string
  applied_amount: number
  deposit_amount: number
  balance_before: number
  warning?:       string  // 중복 수금 경고
}

// ============================================================
// 수금 등록 — create_payment_atomic RPC 전용
// JS 계산 완전 금지. 모든 계산은 DB 트랜잭션 내에서 처리.
// ============================================================

export async function createPayment(
  input: CreatePaymentInput,
): Promise<ActionResult<CreatePaymentResult>> {
  const supabase = await createSupabaseServer()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: '로그인이 필요합니다.' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 정보를 불러올 수 없습니다.' }

  if (!input.customer_id)
    return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount))
    return { success: false, error: '유효한 금액을 입력해주세요. (양의 정수)' }

  // 중복 수금 감지 (2분 내 동일 customer + 동일 amount)
  let dupWarning: string | undefined
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recentPayment } = await supabase
    .from('payments')
    .select('id, created_at')
    .eq('customer_id', input.customer_id)
    .eq('tenant_id', me.tenant_id)
    .eq('amount', input.amount)
    .eq('status', 'confirmed')
    .gte('created_at', twoMinsAgo)
    .limit(1)
    .single()
  if (recentPayment) {
    dupWarning = `최근 동일 금액(${input.amount.toLocaleString()}원)의 수금이 등록되어 있습니다. 중복인지 확인하세요.`
  }

  // RPC: balance 계산 + deposit 분리 + insert 단일 트랜잭션
  const { data: rpcData, error: rpcErr } = await supabase.rpc('create_payment_atomic', {
    p_tenant_id:      me.tenant_id,
    p_customer_id:    input.customer_id,
    p_amount:         input.amount,
    p_payment_date:   input.payment_date,
    p_payment_method: input.payment_method,
    p_memo:           input.memo ?? null,
    p_created_by:     user.id,
  })
  if (rpcErr || !rpcData)
    return { success: false, error: `수금 저장 실패: ${rpcErr?.message}` }

  await linkActionResult({
    customer_id:        input.customer_id,
    tenant_id:          me.tenant_id,
    result_type:        'payment_completed',
    result_amount:      input.amount,
    related_payment_id: rpcData.id as string,
  })

  revalidatePath('/customers')
  revalidatePath('/payments/new')

  return {
    success: true,
    data: {
      id:             rpcData.id             as string,
      applied_amount: rpcData.applied_amount as number,
      deposit_amount: rpcData.deposit_amount as number,
      balance_before: rpcData.balance_before as number,
      warning:        dupWarning,
    },
  }
}

// ============================================================
// 수금 취소 — status = 'cancelled'만 변경 (delete 금지)
// deposit 복구는 ledger가 confirmed만 집계하므로 자동 처리
// ============================================================

export async function cancelPayment(payment_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: payment } = await supabase
    .from('payments').select('id, status')
    .eq('id', payment_id).eq('tenant_id', me.tenant_id).single()
  if (!payment)                       return { success: false, error: '수금 내역을 찾을 수 없습니다.' }
  if (payment.status === 'cancelled') return { success: false, error: '이미 취소된 수금입니다.' }

  const { error } = await supabase
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('id', payment_id)
    .eq('tenant_id', me.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/customers')
  revalidatePath('/payments/new')
  return { success: true }
}

// ============================================================
// 잔액 + 예치금 조회 (UI 표시용 — confirmed 기준)
// ============================================================

export async function getCustomerBalance(
  customer_id: string,
): Promise<ActionResult<{ balance: number; deposit: number; customer_name: string }>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: customer } = await supabase
    .from('customers').select('id, name, opening_balance')
    .eq('id', customer_id).eq('tenant_id', me.tenant_id).is('deleted_at', null).single()
  if (!customer) return { success: false, error: '거래처 없음' }

  const [{ data: orderSum }, { data: paymentSum }] = await Promise.all([
    supabase.from('orders')
      .select('total_amount')
      .eq('customer_id', customer_id).eq('tenant_id', me.tenant_id)
      .eq('status', 'confirmed').is('deleted_at', null),
    supabase.from('payments')
      .select('amount, deposit_amount')
      .eq('customer_id', customer_id).eq('tenant_id', me.tenant_id)
      .eq('status', 'confirmed'),
  ])

  const totalOrders   = (orderSum   ?? []).reduce((s, o) => s + o.total_amount,         0)
  const totalPayments = (paymentSum ?? []).reduce((s, p) => s + p.amount,                0)
  const totalDeposit  = (paymentSum ?? []).reduce((s, p) => s + (p.deposit_amount ?? 0), 0)
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  let query = supabase
    .from('payments')
    .select('id, payment_date, customer_id, amount, deposit_amount, payment_method, memo, status, created_at, customers(id, name)')
    .eq('tenant_id', me.tenant_id)
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
