'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import type { PaymentTermsType } from '@/lib/payment-terms'
import { isSafeNumber } from '@/lib/is-safe-number'
import { effectiveOrderAmount, saleAmount, getAccountsReceivable } from '@/lib/ledger-calc'

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

export async function getCustomerList(opts?: {
  safe_number?: boolean
}): Promise<ActionResult<CustomerListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
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
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .order('name')

  if (opts?.safe_number) {
    query = query.ilike('phone', '050%')
  }

  const { data, error } = await query

  if (error) return { success: false, error: error.message }

  let rows = data ?? []
  if (opts?.safe_number) {
    rows = rows.filter((c: { phone?: string | null }) => isSafeNumber(c.phone ?? ''))
  }

  return {
    success: true,
    data: rows.map((c: any) => ({
      ...c,
      channel_name: c.acquisition_channels?.name ?? null,
    })),
  }
}

export async function getCustomerDetail(id: string): Promise<ActionResult<CustomerListItem>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

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
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  return {
    success: true,
    data: { ...data, channel_name: (data as any).acquisition_channels?.name ?? null },
  }
}

// ── 거래처 상세: 주문/수금 이력 + KPI ─────────────────────────

export interface CustomerOrderRowItem {
  id: string
  order_date: string
  order_number: string | null
  status: string
  order_status: string | null
  total_amount: number
  product_summary: string
}

export interface CustomerPaymentRowItem {
  id: string
  payment_date: string
  payment_method: string
  amount: number
  status: string
  memo: string | null
}

export interface CustomerFinanceSummary {
  receivable: number
  month_sales: number
  lifetime_sales: number
  last_payment_date: string | null
  days_since_last_payment: number | null
}

function orderProductSummary(
  lines: Array<{ product_name: string | null; quantity: number | null }> | null | undefined,
): string {
  if (!lines || lines.length === 0) return '-'
  const first = lines[0]
  const name = (first.product_name ?? '').trim() || '상품'
  if (lines.length === 1) return `${name} ${first.quantity ?? 0}개`
  return `${name} 외 ${lines.length - 1}건`
}

export async function getCustomerOrders(
  customerId: string,
  limit = 10,
): Promise<ActionResult<CustomerOrderRowItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const safeLimit = Math.min(Math.max(1, limit), 50)

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_date, order_number, status, order_status,
      total_amount, discount_amount, point_used, deposit_used, final_amount,
      order_lines ( product_name, quantity )
    `)
    .eq('customer_id', customerId)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((o: any) => ({
      id: o.id,
      order_date: o.order_date,
      order_number: o.order_number ?? null,
      status: o.status ?? '',
      order_status: o.order_status ?? null,
      total_amount: saleAmount({
        total_amount: o.total_amount ?? 0,
        discount_amount: o.discount_amount,
        point_used: o.point_used,
      }),
      product_summary: orderProductSummary(o.order_lines),
    })),
  }
}

export async function getCustomerPayments(
  customerId: string,
  limit = 10,
): Promise<ActionResult<CustomerPaymentRowItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const safeLimit = Math.min(Math.max(1, limit), 50)
  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`

  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_date, payment_method, amount, status, memo')
    .eq('customer_id', customerId)
    .eq('direction', 'inbound')
    .or(payeeScope)
    .is('reversal_of_id', null)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((p: any) => ({
      id: p.id,
      payment_date: p.payment_date,
      payment_method: p.payment_method ?? '',
      amount: p.amount ?? 0,
      status: p.status ?? '',
      memo: p.memo ?? null,
    })),
  }
}

/** KPI용 — 미수/이번달매출/총거래/마지막수금 (병렬 집계, N+1 없음) */
export async function getCustomerFinanceSummary(
  customerId: string,
): Promise<ActionResult<CustomerFinanceSummary>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, opening_balance')
    .eq('id', customerId)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) return { success: false, error: '거래처를 찾을 수 없습니다.' }

  const now = new Date(Date.now() + 9 * 3600000)
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const payeeScope = `payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`
  const sellerScope = `seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`

  const [{ data: orderRows }, { data: paymentRows }, { data: lastPay }] = await Promise.all([
    supabase
      .from('orders')
      .select('order_date, final_amount, total_amount, discount_amount, point_used, deposit_used')
      .eq('customer_id', customerId)
      .or(sellerScope)
      .eq('status', 'confirmed')
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('amount')
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .eq('status', 'confirmed')
      .or(payeeScope)
      .is('reversal_of_id', null),
    supabase
      .from('payments')
      .select('payment_date')
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .eq('status', 'confirmed')
      .or(payeeScope)
      .is('reversal_of_id', null)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let lifetime = 0
  let monthSales = 0
  for (const o of orderRows ?? []) {
    // lifetime → AR(미수) 입력 — deposit 차감
    const recv = effectiveOrderAmount(o as {
      final_amount?: number | null
      total_amount: number
      discount_amount?: number | null
      point_used?: number | null
      deposit_used?: number | null
    })
    lifetime += recv
    // monthSales → 매출 KPI — deposit 미차감
    if (o.order_date >= monthStart && o.order_date <= today) {
      monthSales += saleAmount(o as {
        total_amount: number
        discount_amount?: number | null
        point_used?: number | null
      })
    }
  }

  const totalPayments = (paymentRows ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
  const receivable = getAccountsReceivable(customer.opening_balance ?? 0, lifetime, totalPayments, 0)

  const lastPaymentDate = lastPay?.payment_date ?? null
  let daysSince: number | null = null
  if (lastPaymentDate) {
    daysSince = Math.floor(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(lastPaymentDate + 'T00:00:00Z').getTime()) /
        86400000,
    )
  }

  return {
    success: true,
    data: {
      receivable,
      month_sales: monthSales,
      lifetime_sales: lifetime,
      last_payment_date: lastPaymentDate,
      days_since_last_payment: daysSince,
    },
  }
}
