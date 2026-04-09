'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import type { PaymentTermsType } from '@/lib/payment-terms'

export interface CustomerListItem {
  id: string
  name: string
  phone: string | null
  customer_type: string
  trade_status: string
  payment_terms_type: PaymentTermsType
  payment_terms_days: number
  payment_day: number | null
  opening_balance: number
  target_monthly_revenue: number | null
  is_buyer: boolean
  is_supplier: boolean
  acquisition_channel_id: string | null
  channel_name: string | null
  address: string | null
  biz_number: string | null
  representative_name: string | null
  business_type: string | null
  created_at: string
}

export async function getCustomerList(): Promise<ActionResult<CustomerListItem[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customers')
    .select(`
      id, name, phone, customer_type, trade_status,
      payment_terms_type, payment_terms_days, payment_day,
      opening_balance, target_monthly_revenue,
      is_buyer, is_supplier, acquisition_channel_id,
      address, biz_number, representative_name, business_type,
      created_at,
      acquisition_channels ( name )
    `)
    .is('deleted_at', null)
    .order('name')

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((c: any) => ({
      ...c,
      channel_name: c.acquisition_channels?.name ?? null,
    })),
  }
}

export async function getCustomerDetail(id: string): Promise<ActionResult<CustomerListItem>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customers')
    .select(`
      id, name, phone, customer_type, trade_status,
      payment_terms_type, payment_terms_days, payment_day,
      opening_balance, target_monthly_revenue,
      is_buyer, is_supplier, acquisition_channel_id,
      address, biz_number, representative_name, business_type,
      created_at,
      acquisition_channels ( name )
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  return {
    success: true,
    data: { ...data, channel_name: (data as any).acquisition_channels?.name ?? null },
  }
}
