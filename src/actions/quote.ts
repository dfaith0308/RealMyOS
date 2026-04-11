'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import type {
  Quote, QuoteDetail, QuoteStatus,
  CreateQuoteInput, ConvertQuoteInput,
} from '@/types/quote'

// ============================================================
// 헬퍼
// ============================================================

function calcLineTotal(price: number, qty: number, mode: 'unit' | 'total', totalInput?: number): number {
  if (mode === 'total' && totalInput != null) return totalInput
  return price * qty
}

async function logQuote(supabase: any, opts: {
  quote_id: string; user_id: string; user_type: string
  action: string; before_data?: object | null; after_data?: object | null
}) {
  await supabase.from('quote_logs').insert({
    quote_id:    opts.quote_id,
    user_id:     opts.user_id,
    user_type:   opts.user_type,
    action:      opts.action,
    before_data: opts.before_data ?? null,
    after_data:  opts.after_data  ?? null,
  })
}

// ============================================================
// 견적 생성
// ============================================================

export async function createQuote(input: CreateQuoteInput): Promise<ActionResult<{ quote_id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.customer_id) return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.items?.length) return { success: false, error: '상품을 1개 이상 추가해주세요.' }

  // 검증
  for (const item of input.items) {
    if (item.quantity <= 0) return { success: false, error: `[${item.product_name}] 수량은 0보다 커야 합니다.` }
    if (item.quoted_price < 0) return { success: false, error: `[${item.product_name}] 가격은 0 이상이어야 합니다.` }
  }

  const total_amount = input.items.reduce((s, i) => s + i.line_total, 0)

  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .insert({
      tenant_id:    ctx.tenant_id,
      customer_id:  input.customer_id,
      status:       input.status ?? 'draft',
      total_amount,
      expires_at:   input.expires_at ?? null,
      memo:         input.memo ?? null,
      created_by:   ctx.user_id,
    })
    .select('id')
    .single()

  if (quoteErr || !quote) return { success: false, error: `견적 생성 실패: ${quoteErr?.message}` }

  const { error: itemsErr } = await supabase.from('quote_items').insert(
    input.items.map((i) => ({
      quote_id:     quote.id,
      product_id:   i.product_id,
      product_code: i.product_code,
      product_name: i.product_name,
      quantity:     i.quantity,
      quoted_price: i.quoted_price,
      tax_type:     i.tax_type,
      line_total:   i.line_total,
      pricing_mode: i.pricing_mode ?? 'unit',
      converted_quantity: 0,
      status: 'pending',
    }))
  )

  if (itemsErr) {
    await supabase.from('quotes').delete().eq('id', quote.id)
    return { success: false, error: `항목 저장 실패: ${itemsErr.message}` }
  }

  await logQuote(supabase, {
    quote_id: quote.id, user_id: ctx.user_id, user_type: ctx.user_type,
    action: 'create', before_data: null, after_data: { total_amount, items: input.items },
  })

  revalidatePath('/orders/quotes')
  return { success: true, data: { quote_id: quote.id } }
}

// ============================================================
// 견적 수정
// ============================================================

export async function updateQuote(
  quote_id: string,
  input: Partial<CreateQuoteInput>
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: existing } = await supabase
    .from('quotes').select('id, status')
    .eq('id', quote_id).eq('tenant_id', ctx.tenant_id).is('deleted_at', null).single()

  if (!existing) return { success: false, error: '견적을 찾을 수 없습니다.' }
  if (existing.status === 'converted') return { success: false, error: '전환 완료된 견적은 수정할 수 없습니다.' }

  const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
  if (input.expires_at !== undefined) updatePayload.expires_at = input.expires_at
  if (input.memo !== undefined) updatePayload.memo = input.memo

  if (input.items) {
    const total_amount = input.items.reduce((s, i) => s + i.line_total, 0)
    updatePayload.total_amount = total_amount

    await supabase.from('quote_items').delete().eq('quote_id', quote_id)
    await supabase.from('quote_items').insert(
      input.items.map((i) => ({
        quote_id: quote_id,
        product_id: i.product_id,
        product_code: i.product_code,
        product_name: i.product_name,
        quantity: i.quantity,
        quoted_price: i.quoted_price,
        tax_type: i.tax_type,
        line_total: i.line_total,
        pricing_mode: i.pricing_mode ?? 'unit',
        converted_quantity: 0,
        status: 'pending',
      }))
    )
  }

  await supabase.from('quotes').update(updatePayload).eq('id', quote_id)
  await logQuote(supabase, {
    quote_id, user_id: ctx.user_id, user_type: ctx.user_type,
    action: 'update', after_data: updatePayload,
  })

  revalidatePath('/orders/quotes')
  return { success: true }
}

// ============================================================
// 견적 삭제 (soft delete)
// ============================================================

export async function deleteQuote(quote_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('quotes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', quote_id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  await logQuote(supabase, {
    quote_id, user_id: ctx.user_id, user_type: ctx.user_type, action: 'delete',
  })

  revalidatePath('/orders/quotes')
  return { success: true }
}

// ============================================================
// 예비거래처 생성 (전화번호 기반 중복 방지)
// ============================================================

function normalizePhone(phone: string): string {
  // +82 국가코드 → 0 변환, 숫자만 남김
  // 예: +82 10-1234-5678 → 01012345678
  return phone
    .replace(/^\+82\s?/, '0')   // +82 → 0
    .replace(/[^0-9]/g, '')       // 숫자만
}

export async function createProspectCustomer(
  name: string, phone?: string
): Promise<ActionResult<{ customer_id: string; existed: boolean }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!name.trim()) return { success: false, error: '거래처명을 입력해주세요.' }

  const normalizedPhone = phone ? normalizePhone(phone) : null

  // 1. 전화번호 기준 기존 거래처 조회
  if (normalizedPhone) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id, name, phone')
      .eq('tenant_id', ctx.tenant_id)
      .is('deleted_at', null)
      .or(`phone.eq.${normalizedPhone},phone.eq.${phone?.trim()}`)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // 동일 번호 존재 → 기존 거래처 반환 (중복 생성 금지)
      return {
        success: true,
        data: { customer_id: existing.id, existed: true },
      }
    }
  }

  // 2. 없으면 신규 생성
  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:     ctx.tenant_id,
      name:          name.trim(),
      phone:         normalizedPhone ?? null,
      customer_type: 'prospect',
      trade_status:  'lead',
      is_buyer:      true,
      created_by:    ctx.user_id,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: `거래처 생성 실패: ${error?.message}` }
  return { success: true, data: { customer_id: data.id, existed: false } }
}

// ============================================================
// 견적 목록
// ============================================================

export async function getQuotes(filters?: {
  status?: QuoteStatus; customer_name?: string
}): Promise<ActionResult<Quote[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let q = supabase
    .from('quotes')
    .select('id, tenant_id, customer_id, status, total_amount, expires_at, memo, created_at, updated_at, customers(name)')
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const today = new Date().toISOString().slice(0, 10)
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      customer_id: r.customer_id,
      customer_name: r.customers?.name ?? '',
      status: r.expires_at && r.expires_at < today && r.status !== 'converted'
        ? 'expired'
        : r.status,
      total_amount: r.total_amount,
      expires_at: r.expires_at,
      memo: r.memo,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  }
}

// ============================================================
// 견적 상세
// ============================================================

export async function getQuoteDetail(quote_id: string): Promise<ActionResult<QuoteDetail>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const [{ data: quote }, { data: items }] = await Promise.all([
    supabase.from('quotes')
      .select('*, customers(name)')
      .eq('id', quote_id).eq('tenant_id', ctx.tenant_id).is('deleted_at', null).single(),
    supabase.from('quote_items')
      .select('*')
      .eq('quote_id', quote_id)
      .order('created_at', { ascending: true }),
  ])

  if (!quote) return { success: false, error: '견적을 찾을 수 없습니다.' }

  const today = new Date().toISOString().slice(0, 10)
  const status = quote.expires_at && quote.expires_at < today && quote.status !== 'converted'
    ? 'expired' : quote.status

  return {
    success: true,
    data: {
      id: quote.id, tenant_id: quote.tenant_id, customer_id: quote.customer_id,
      customer_name: (quote as any).customers?.name ?? '',
      status, total_amount: quote.total_amount, expires_at: quote.expires_at,
      memo: quote.memo, created_at: quote.created_at, updated_at: quote.updated_at,
      items: items ?? [],
    },
  }
}

// ============================================================
// 견적 → 주문 전환 (RPC 기반 동시성 보장)
// ============================================================

export async function convertQuoteToOrder(input: ConvertQuoteInput): Promise<ActionResult<{ order_id: string; order_number: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.conversions.length) return { success: false, error: '전환할 항목을 선택해주세요.' }

  // 1. RPC로 동시성 안전하게 converted_quantity 업데이트
  const { data: rpcResult } = await supabase.rpc('convert_quote_items', {
    p_quote_id:    input.quote_id,
    p_tenant_id:   ctx.tenant_id,
    p_conversions: JSON.stringify(input.conversions.map((c) => ({ item_id: c.item_id, qty: c.qty }))),
  })

  if (!rpcResult?.success) {
    return { success: false, error: rpcResult?.error ?? '전환 처리 실패' }
  }

  // 2. 현재 cost_price 조회
  const productIds = [...new Set(input.conversions.map((c) => c.product_id))]
  const { data: products } = await supabase
    .from('products')
    .select('id, procurement_type, product_costs(cost_price, start_date, end_date)')
    .in('id', productIds)
    .eq('tenant_id', ctx.tenant_id)

  const productMap = new Map((products ?? []).map((p: any) => [p.id, p]))
  const today = new Date().toISOString().slice(0, 10)

  function getCostPrice(costs: any[], date: string): number {
    const valid = (costs ?? [])
      .filter((c: any) => c.start_date <= date && (c.end_date === null || c.end_date >= date))
      .sort((a: any, b: any) => b.start_date.localeCompare(a.start_date))
    return valid[0]?.cost_price ?? 0
  }

  // 3. 주문 생성 — 기존 createOrder 흐름 재사용
  const { createOrder } = await import('@/actions/order')

  const orderLines = input.conversions.map((c) => {
    const product = productMap.get(c.product_id) as any
    const cost_price = product ? getCostPrice(product.product_costs ?? [], today) : 0
    const fulfillment_type = product?.procurement_type === 'stock' ? 'stock' : 'consignment'
    const line_total = c.quoted_price * c.qty
    return {
      product_id:          c.product_id,
      product_code:        c.product_code,
      product_name:        c.product_name,
      quantity:            c.qty,
      unit_price:          c.quoted_price,
      cost_price,
      tax_type:            c.tax_type,
      fulfillment_type:    fulfillment_type as 'stock' | 'consignment',
      line_total_override: line_total,
    }
  })

  const orderResult = await createOrder({
    customer_id: (await supabase.from('quotes').select('customer_id').eq('id', input.quote_id).single()).data?.customer_id ?? '',
    order_date:  input.order_date ?? today,
    memo:        input.memo ?? `견적 전환`,
    lines:       orderLines,
  })

  if (!orderResult.success || !orderResult.data) {
    return { success: false, error: `주문 생성 실패: ${orderResult.error}` }
  }

  await logQuote(supabase, {
    quote_id: input.quote_id, user_id: ctx.user_id, user_type: ctx.user_type,
    action: 'convert',
    after_data: { order_id: orderResult.data.order_id, conversions: input.conversions },
  })

  revalidatePath('/orders/quotes')
  revalidatePath('/orders')
  return { success: true, data: { order_id: orderResult.data.order_id, order_number: orderResult.data.order_number } }
}