'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface PurchaseListItem {
  id:                 string
  counterparty_name:  string
  product_name:       string
  quantity:           number
  unit:               string | null
  unit_price:         number
  total_amount:       number
  purchase_date:      string
  status:             string
  order_id:           string | null
  memo:               string | null
  created_at:         string
}

export async function getPurchaseList(filters?: {
  status?: string
}): Promise<ActionResult<PurchaseListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('purchases')
    .select(
      'id, counterparty_name, product_name, quantity, unit, unit_price, total_amount, purchase_date, status, order_id, memo, created_at',
    )
    .eq('tenant_id', ctx.tenant_id)
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id:                r.id,
      counterparty_name: r.counterparty_name,
      product_name:      r.product_name,
      quantity:          r.quantity,
      unit:              r.unit,
      unit_price:        r.unit_price,
      total_amount:      r.total_amount,
      purchase_date:     r.purchase_date,
      status:            r.status,
      order_id:          r.order_id,
      memo:              r.memo,
      created_at:        r.created_at,
    })),
  }
}

/** 지급 분배 화면: 미지급·부분지급 매입만 */
export async function getUnpaidPurchases(): Promise<ActionResult<PurchaseListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('purchases')
    .select(
      'id, counterparty_name, product_name, quantity, unit, unit_price, total_amount, purchase_date, status, order_id, memo, created_at',
    )
    .eq('tenant_id', ctx.tenant_id)
    .in('status', ['unpaid', 'partial'])
    .order('purchase_date', { ascending: false })
    .limit(200)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id:                r.id,
      counterparty_name: r.counterparty_name,
      product_name:      r.product_name,
      quantity:          r.quantity,
      unit:              r.unit,
      unit_price:        r.unit_price,
      total_amount:      r.total_amount,
      purchase_date:     r.purchase_date,
      status:            r.status,
      order_id:          r.order_id,
      memo:              r.memo,
      created_at:        r.created_at,
    })),
  }
}

export interface CreatePurchaseInput {
  counterparty_name: string
  product_name:      string
  quantity:          number
  unit?:             string | null
  unit_price:        number
  total_amount:      number
  purchase_date?:    string
  order_id?:         string | null
  memo?:             string | null
}

export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.counterparty_name?.trim()) return { success: false, error: '매입처명을 입력해주세요.' }
  if (!input.product_name?.trim()) return { success: false, error: '품목명을 입력해주세요.' }
  if (!input.quantity || input.quantity <= 0 || !Number.isInteger(input.quantity))
    return { success: false, error: '수량은 양의 정수여야 합니다.' }
  if (!input.unit_price || input.unit_price <= 0 || !Number.isInteger(input.unit_price))
    return { success: false, error: '단가는 양의 정수여야 합니다.' }
  if (!input.total_amount || input.total_amount <= 0 || !Number.isInteger(input.total_amount))
    return { success: false, error: '합계 금액은 양의 정수여야 합니다.' }

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      tenant_id:         ctx.tenant_id,
      counterparty_name: input.counterparty_name.trim(),
      product_name:      input.product_name.trim(),
      quantity:          input.quantity,
      unit:              input.unit?.trim() || null,
      unit_price:        input.unit_price,
      total_amount:      input.total_amount,
      purchase_date:     input.purchase_date ?? new Date().toISOString().slice(0, 10),
      order_id:          input.order_id ?? null,
      memo:              input.memo?.trim() || null,
      created_by:        ctx.user_id,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  if (!data?.id) return { success: false, error: '매입 저장 실패' }

  revalidatePath('/purchases')
  revalidatePath('/purchases/new')
  revalidatePath('/disbursements/new')

  return { success: true, data: { id: data.id } }
}
