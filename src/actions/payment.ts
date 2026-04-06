'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

// ============================================================
// 수금 등록
// ============================================================

export type PaymentMethod = 'transfer' | 'cash' | 'card'

export interface CreatePaymentInput {
  customer_id: string
  amount: number
  payment_date: string       // YYYY-MM-DD
  payment_method: PaymentMethod
  memo?: string
  action_log_id?: string     // 연결할 action_log_id (있으면 conversion 업데이트)
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()

  // 1. 인증
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: '로그인이 필요합니다.' }

  // 2. tenant_id 조회
  const { data: me } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 정보를 불러올 수 없습니다.' }
  const tenant_id = me.tenant_id

  // 3. 검증
  if (!input.customer_id) return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.amount || input.amount <= 0) return { success: false, error: '금액을 입력해주세요.' }

  // 4. 거래처 접근 권한 확인
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', input.customer_id)
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처입니다.' }

  // 5. payments INSERT
  const { data, error } = await supabase
    .from('payments')
    .insert({
      tenant_id,
      customer_id: input.customer_id,
      amount: input.amount,
      payment_date: input.payment_date,
      payment_method: input.payment_method,
      memo: input.memo?.trim() || null,
      status: 'confirmed',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: `저장 실패: ${error?.message}` }

  // 수금 시 연락 기록 자동 저장 + action_log 연결 (실패해도 수금은 완료 처리)
  const { data: contactData } = await supabase
    .from('contact_logs')
    .insert({
      tenant_id,
      customer_id: input.customer_id,
      contact_method: 'payment',
      memo: `수금 ${input.amount.toLocaleString()}원`,
      contacted_by: user.id,
      contacted_at: new Date().toISOString(),
      action_log_id: input.action_log_id ?? null,
    })
    .select('id')
    .single()

  if (input.action_log_id && contactData?.id) {
    const { updateActionConversion } = await import('@/actions/action-log')
    await updateActionConversion(input.action_log_id, 'success', contactData.id)
  }

  revalidatePath('/orders')
  revalidatePath('/payments')
  revalidatePath('/customers')

  return { success: true, data: { id: data.id } }
}

// ============================================================
// 거래처별 현재 잔액 조회
// 잔액 = opening_balance + Σ판매 - Σ수금 + Σ반품
// confirmed 상태만 포함
// ============================================================

export async function getCustomerBalance(
  customer_id: string,
): Promise<ActionResult<{ balance: number; customer_name: string }>> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  // 거래처 기본 정보 + 기초잔액
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처 없음' }

  // 주문 합계 (confirmed)
  const { data: orderSum } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  // 수금 합계 (confirmed)
  const { data: paymentSum } = await supabase
    .from('payments')
    .select('amount')
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')

  const totalOrders = (orderSum ?? []).reduce((s, o) => s + o.total_amount, 0)
  const totalPayments = (paymentSum ?? []).reduce((s, p) => s + p.amount, 0)
  const balance = (customer.opening_balance ?? 0) + totalOrders - totalPayments

  return {
    success: true,
    data: { balance, customer_name: customer.name },
  }
}