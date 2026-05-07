'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

export type CustomerProductPriceSource = 'quote' | 'order'

export interface CustomerProductPriceRow {
  id: string
  tenant_id: string | null
  customer_id: string
  product_id: string
  last_price: number
  updated_at: string | null
  last_line_total: number | null
  last_qty: number | null
  last_pricing_mode: 'unit' | 'total' | null
  source: CustomerProductPriceSource | null
}

export interface CustomerProductPriceListRow {
  id: string
  product_id: string
  product_name: string
  last_price: number
  last_qty: number | null
  last_line_total: number | null
  last_pricing_mode: 'unit' | 'total' | null
  source: CustomerProductPriceSource | null
  updated_at: string | null
}

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export async function getCustomerProductPrice(
  customer_id: string,
  product_id: string,
): Promise<ActionResult<CustomerProductPriceRow | null>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customer_product_prices')
    .select('id, tenant_id, customer_id, product_id, last_price, updated_at, last_line_total, last_qty, last_pricing_mode, source')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .eq('product_id', product_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data as any) ?? null }
}

export async function upsertCustomerProductPrice(input: {
  customer_id: string
  product_id: string
  tenant_id: string
  last_price: number
  source: CustomerProductPriceSource
  last_qty?: number | null
  last_line_total?: number | null
  last_pricing_mode?: 'unit' | 'total' | null
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (input.tenant_id !== ctx.tenant_id)
    return { success: false, error: 'tenant_id 불일치' }

  const payload = {
    tenant_id: input.tenant_id,
    customer_id: input.customer_id,
    product_id: input.product_id,
    last_price: Math.round(input.last_price ?? 0),
    last_qty: input.last_qty ?? null,
    last_line_total: input.last_line_total ?? null,
    last_pricing_mode: input.last_pricing_mode ?? null,
    source: input.source,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('customer_product_prices')
    .upsert(payload, { onConflict: 'customer_id,product_id' })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getCustomerProductPrices(
  customer_id: string,
): Promise<ActionResult<CustomerProductPriceListRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customer_product_prices')
    .select('id, product_id, last_price, last_qty, last_line_total, last_pricing_mode, source, updated_at, products(name)')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: Array.isArray(r.products) ? (r.products[0]?.name ?? '-') : (r.products?.name ?? '-'),
      last_price: r.last_price ?? 0,
      last_qty: r.last_qty ?? null,
      last_line_total: r.last_line_total ?? null,
      last_pricing_mode: r.last_pricing_mode ?? null,
      source: r.source ?? null,
      updated_at: r.updated_at ?? null,
    })),
  }
}

