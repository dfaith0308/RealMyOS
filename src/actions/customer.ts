'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import type { PaymentTermsType } from '@/lib/payment-terms'

export interface CustomerInput {
  customer_type?: 'business' | 'individual' | 'prospect'
  name: string
  phone?: string
  address?: string
  biz_number?: string
  representative_name?: string
  business_type?: string
  opening_balance?: number
  opening_balance_date?: string
  payment_terms_type?: PaymentTermsType
  payment_terms_days?: number
  payment_day?: number
  target_monthly_revenue?: number
  target_per_order?: number
  acquisition_channel_id?: string
  is_buyer?: boolean
  is_supplier?: boolean
  trade_status?: 'active' | 'inactive' | 'lead'
}

// ── 거래처 등록 ───────────────────────────────────────────────

export async function createCustomer(
  input: CustomerInput,
): Promise<ActionResult<{ id: string; name: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const name = input.name.trim()
  if (!name) return { success: false, error: '거래처명을 입력해주세요.' }

  const today = new Date().toISOString().slice(0, 10)
  const openingBalance = input.opening_balance ?? 0

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:              ctx.tenant_id,
      customer_type:          input.customer_type ?? 'business',
      name,
      phone:                  input.phone?.trim() || null,
      address:                input.address?.trim() || null,
      biz_number:             input.biz_number?.replace(/-/g, '').trim() || null,
      representative_name:    input.representative_name?.trim() || null,
      business_type:          input.business_type?.trim() || null,
      opening_balance:        openingBalance,
      opening_balance_date:   input.opening_balance_date || today,
      payment_terms_type:     input.payment_terms_type ?? 'immediate',
      payment_terms_days:     input.payment_terms_days ?? 0,
      payment_day:            input.payment_day ?? null,
      target_monthly_revenue: input.target_monthly_revenue || null,
      target_per_order:       input.target_per_order || null,
      acquisition_channel_id: input.acquisition_channel_id || null,
      is_buyer:               input.is_buyer ?? true,
      is_supplier:            input.is_supplier ?? false,
      trade_status:           input.trade_status ?? 'active',
      status:                 'active',
    })
    .select('id, name')
    .single()

  if (error || !data) return { success: false, error: `저장 실패: ${error?.message}` }

  if (openingBalance !== 0) {
    await supabase.from('opening_balance_logs').insert({
      tenant_id:     ctx.tenant_id,
      customer_id:   data.id,
      before_amount: 0,
      after_amount:  openingBalance,
      changed_by:    ctx.user_id,
      reason:        '최초 등록',
    })
  }

  revalidatePath('/customers')
  revalidatePath('/customers/list')
  return { success: true, data: { id: data.id, name: data.name } }
}

// ── 거래처 수정 ───────────────────────────────────────────────

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInput>,
  openingBalanceReason?: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: current } = await supabase
    .from('customers')
    .select('opening_balance')
    .eq('id', id).eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()

  const payload: Record<string, any> = {}
  if (input.name)                                 payload.name = input.name.trim()
  if (input.phone !== undefined)                  payload.phone = input.phone?.trim() || null
  if (input.address !== undefined)                payload.address = input.address?.trim() || null
  if (input.biz_number !== undefined)             payload.biz_number = input.biz_number?.replace(/-/g, '') || null
  if (input.representative_name !== undefined)    payload.representative_name = input.representative_name?.trim() || null
  if (input.business_type !== undefined)          payload.business_type = input.business_type?.trim() || null
  if (input.customer_type)                        payload.customer_type = input.customer_type
  if (input.payment_terms_type)                   payload.payment_terms_type = input.payment_terms_type
  if (input.payment_terms_days !== undefined)     payload.payment_terms_days = input.payment_terms_days
  if (input.payment_day !== undefined)            payload.payment_day = input.payment_day ?? null
  if (input.target_monthly_revenue !== undefined) payload.target_monthly_revenue = input.target_monthly_revenue || null
  if (input.acquisition_channel_id !== undefined) payload.acquisition_channel_id = input.acquisition_channel_id || null
  if (input.is_buyer !== undefined)               payload.is_buyer = input.is_buyer
  if (input.is_supplier !== undefined)            payload.is_supplier = input.is_supplier
  if (input.trade_status)                         payload.trade_status = input.trade_status
  if (input.opening_balance !== undefined)        payload.opening_balance = input.opening_balance

  const { error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', id).eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }

  if (
    input.opening_balance !== undefined &&
    current &&
    input.opening_balance !== current.opening_balance
  ) {
    await supabase.from('opening_balance_logs').insert({
      tenant_id:     ctx.tenant_id,
      customer_id:   id,
      before_amount: current.opening_balance ?? 0,
      after_amount:  input.opening_balance,
      changed_by:    ctx.user_id,
      reason:        openingBalanceReason ?? '수정',
    })
  }

  revalidatePath('/customers')
  revalidatePath('/customers/list')
  revalidatePath(`/customers/${id}/edit`)
  return { success: true }
}

// ── 중복 체크 ─────────────────────────────────────────────────

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  hasSimilar:   boolean
  existingId?:  string
  existingName?: string
}

export async function checkCustomerDuplicate(input: {
  business_number?: string
  name?: string
  phone?: string
}): Promise<ActionResult<DuplicateCheckResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const bizNum = input.business_number?.replace(/-/g, '').trim()

  if (bizNum) {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', ctx.tenant_id)
      .eq('biz_number', bizNum)
      .is('deleted_at', null)
      .single()

    if (data) return {
      success: true,
      data: { hasDuplicate: true, hasSimilar: false, existingId: data.id, existingName: data.name },
    }
  }

  const normalizedPhone = input.phone?.replace(/-/g, '').trim()
  if (input.name?.trim() && normalizedPhone) {
    const { data: list } = await supabase
      .from('customers')
      .select('id, name, phone')
      .eq('tenant_id', ctx.tenant_id)
      .eq('name', input.name.trim())
      .is('deleted_at', null)

    const match = (list ?? []).find(
      (c: any) => (c.phone ?? '').replace(/-/g, '') === normalizedPhone
    )
    if (match) return {
      success: true,
      data: { hasDuplicate: false, hasSimilar: true, existingId: match.id, existingName: match.name },
    }
  }

  return { success: true, data: { hasDuplicate: false, hasSimilar: false } }
}

// ── 거래처 삭제 (soft delete) ─────────────────────────────────

export async function deleteCustomer(customer_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('soft_delete_customer', {
    p_customer_id: customer_id,
    p_tenant_id:   ctx.tenant_id,
    p_deleted_by:  ctx.user_id,
  })

  if (error) {
    if (error.message.includes('has_orders'))
      return { success: false, error: '확정 주문이 있는 거래처는 삭제할 수 없습니다.' }
    if (error.message.includes('has_payments'))
      return { success: false, error: '수금 내역이 있는 거래처는 삭제할 수 없습니다.' }
    if (error.message.includes('already deleted'))
      return { success: false, error: '이미 삭제된 거래처입니다.' }
    return { success: false, error: error.message }
  }

  revalidatePath('/customers')
  revalidatePath('/customers/all')
  return { success: true }
}