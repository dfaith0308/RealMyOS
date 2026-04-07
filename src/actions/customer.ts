'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface CreateCustomerInput {
  customer_type: 'business' | 'individual' | 'prospect'
  name: string
  phone?: string
  email?: string
  address?: string
  business_number?: string       // 하이픈 자동 제거
  representative_name?: string
  business_type?: string
  opening_balance?: number
  opening_balance_date?: string  // YYYY-MM-DD
  payment_terms_days?: 0 | 30 | 45 | 60
  target_monthly_revenue?: number
  target_per_order?: number
  acquisition_channel_id?: string
  is_buyer?: boolean
  is_supplier?: boolean
  trade_status?: 'active' | 'inactive' | 'lead'
}

export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult<{ id: string; name: string }>> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 정보를 불러올 수 없습니다.' }

  const name = input.name.trim()
  if (!name) return { success: false, error: '거래처명을 입력해주세요.' }

  // 사업자번호 하이픈 제거
  const biz = input.business_number?.replace(/-/g, '').trim() || null

  const today = new Date().toISOString().slice(0, 10)
  const openingBalance = input.opening_balance ?? 0

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:              me.tenant_id,
      customer_type:          input.customer_type ?? 'business',
      name,
      phone:                  input.phone?.trim() || null,
      email:                  input.email?.trim() || null,
      address:                input.address?.trim() || null,
      biz_number:             biz,
      representative_name:    input.representative_name?.trim() || null,
      business_type:          input.business_type?.trim() || null,
      opening_balance:        openingBalance,
      opening_balance_date:   input.opening_balance_date || today,
      payment_terms_days:     input.payment_terms_days ?? 0,
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

  // opening_balance 이력 기록
  if (openingBalance !== 0) {
    await supabase.from('opening_balance_logs').insert({
      tenant_id:    me.tenant_id,
      customer_id:  data.id,
      before_amount: 0,
      after_amount:  openingBalance,
      changed_by:   user.id,
      reason:       '최초 등록',
    })
  }

  revalidatePath('/customers')
  return { success: true, data: { id: data.id, name: data.name } }
}

export async function updateOpeningBalance(input: {
  customer_id: string
  new_amount: number
  reason: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: current } = await supabase
    .from('customers')
    .select('opening_balance')
    .eq('id', input.customer_id)
    .eq('tenant_id', me.tenant_id)
    .single()

  if (!current) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  const { error } = await supabase
    .from('customers')
    .update({ opening_balance: input.new_amount })
    .eq('id', input.customer_id)
    .eq('tenant_id', me.tenant_id)

  if (error) return { success: false, error: error.message }

  await supabase.from('opening_balance_logs').insert({
    tenant_id:     me.tenant_id,
    customer_id:   input.customer_id,
    before_amount: current.opening_balance ?? 0,
    after_amount:  input.new_amount,
    changed_by:    user.id,
    reason:        input.reason,
  })

  revalidatePath('/customers')
  return { success: true }
}
