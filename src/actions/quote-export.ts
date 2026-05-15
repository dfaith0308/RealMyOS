'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export interface QuoteExportItem {
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface QuoteExportCompanyInfo {
  company_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  address?: string | null
  logo_url?: string | null
  stamp_url?: string | null
}

export interface QuoteForExport {
  quote_id: string
  customer_name: string
  quote_date: string
  expires_at: string | null
  total_amount: number
  memo: string | null
  items: QuoteExportItem[]
  company: QuoteExportCompanyInfo
}

function pickSetting(map: Map<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = map.get(k)
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

export async function getQuoteForExport(quote_id: string): Promise<ActionResult<QuoteForExport>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const [{ data: quote, error: qErr }, { data: settingsRows }] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, tenant_id, customer_id, quote_date, expires_at, total_amount, memo, customers(name), quote_items(product_name, quantity, quoted_price, line_total)')
      .eq('id', quote_id)
      .eq('tenant_id', ctx.tenant_id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('settings')
      .select('key, value')
      .eq('tenant_id', ctx.tenant_id),
  ])

  if (qErr || !quote) return { success: false, error: qErr?.message ?? '견적 조회 실패' }

  const settingsMap = new Map((settingsRows ?? []).map((r: any) => [r.key as string, r.value as string]))

  const company: QuoteExportCompanyInfo = {
    company_name: pickSetting(settingsMap, ['company_name', 'business_name', 'shop_name']),
    contact_phone: pickSetting(settingsMap, ['company_phone', 'contact_phone', 'phone']),
    contact_email: pickSetting(settingsMap, ['company_email', 'contact_email', 'email']),
    address: pickSetting(settingsMap, ['company_address', 'address']),
    logo_url: pickSetting(settingsMap, ['company_logo_url', 'logo_url', 'voucher_logo_url']),
    stamp_url: pickSetting(settingsMap, ['company_stamp_url', 'stamp_url', 'voucher_stamp_url']),
  }

  const items = ((quote as any).quote_items ?? []).map((it: any) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    unit_price: it.quoted_price,
    line_total: it.line_total,
  })) as QuoteExportItem[]

  const customer_name =
    Array.isArray((quote as any).customers)
      ? ((quote as any).customers[0]?.name ?? '-')
      : ((quote as any).customers?.name ?? '-')

  return {
    success: true,
    data: {
      quote_id: quote.id,
      customer_name,
      quote_date: (quote as any).quote_date ?? String((quote as any).created_at ?? '').slice(0, 10),
      expires_at: (quote as any).expires_at ?? null,
      total_amount: (quote as any).total_amount ?? 0,
      memo: (quote as any).memo ?? null,
      items,
      company,
    },
  }
}

export async function logQuoteExport(
  quote_id: string,
  detail: 'pdf' | 'jpg',
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('quote_logs')
    .insert({
      quote_id,
      user_id: ctx.user_id,
      user_type: ctx.user_type,
      action: 'exported',
      before_data: null,
      after_data: { detail },
    })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

