'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

// ── 공통 ─────────────────────────────────────────────────────

async function logProduct(supabase: any, opts: {
  product_id: string; user_id: string; user_type: string
  action: string; before_data?: object; after_data?: object
}) {
  await supabase.from('product_logs').insert({
    product_id: opts.product_id,
    user_id: opts.user_id,
    user_type: opts.user_type,
    action: opts.action,
    before_data: opts.before_data ?? null,
    after_data: opts.after_data ?? null,
  })
}

// ── 상품 등록 ─────────────────────────────────────────────────

export interface CreateProductInput {
  name: string
  tax_type: 'taxable' | 'exempt'
  category_id?: string
  supplier_id?: string
  barcode?: string
  min_margin_rate?: number
  cost_price: number
  selling_price?: number
  siksiki_price?: number
  subscription_price?: number
  bulk_price?: number
  bulk_min_quantity?: number
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ActionResult<{ id: string; product_code: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.name.trim()) return { success: false, error: '상품명을 입력해주세요.' }
  if (!input.cost_price || input.cost_price <= 0) return { success: false, error: '매입가를 입력해주세요.' }

  // 바코드 중복 체크 (DB unique constraint 전 1차 방어)
  if (input.barcode?.trim()) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('barcode', input.barcode.trim())
      .is('deleted_at', null)
      .single()
    if (existing) return { success: false, error: '이미 사용 중인 바코드입니다.' }
  }

  // category_id 존재 여부 검증 (FK 에러 방지)
  if (input.category_id) {
    const { data: cat } = await supabase
      .from('product_categories')
      .select('id')
      .eq('id', input.category_id)
      .eq('tenant_id', ctx.tenant_id)
      .single()
    if (!cat) return { success: false, error: '유효하지 않은 카테고리입니다.' }
  }

  // product_code 채번
  // 1순위: product_code_seq (sequence 기반, 동시 생성 안전)
  // 2순위: max + 1 fallback (sequence 없을 때)
  let seqNum: number | null = null
  try {
    const { data: seqData } = await supabase.rpc('nextval_product_code')
    seqNum = seqData ?? null
  } catch (_) {
    // sequence RPC 없으면 fallback
  }
  if (seqNum === null) {
    const { data: lastProduct } = await supabase
      .from('products')
      .select('product_code')
      .like('product_code', 'P%')
      .order('product_code', { ascending: false })
      .limit(1)
      .single()
    seqNum = lastProduct?.product_code
      ? (parseInt(lastProduct.product_code.replace(/[^0-9]/g, ''), 10) || 0) + 1
      : 1
  }
  const product_code = `P${String(seqNum).padStart(4, '0')}`

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({
      tenant_id: ctx.tenant_id,
      product_code,
      name: input.name.trim(),
      tax_type: input.tax_type,
      category_id: input.category_id ?? null,
      supplier_id: input.supplier_id ?? null,
      barcode: input.barcode?.trim() || null,
      min_margin_rate: input.min_margin_rate ?? null,
      procurement_type: 'consignment',
    })
    .select('id, product_code')
    .single()

  if (pErr || !product) return { success: false, error: `상품 저장 실패: ${pErr?.message}` }

  const today = new Date().toISOString().slice(0, 10)

  // product_costs insert
  const { error: costErr } = await supabase.from('product_costs').insert({
    product_id: product.id,
    cost_price: input.cost_price,
    start_date: today,
    end_date: null,
  })
  if (costErr) {
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', product.id)
    return { success: false, error: `매입가 저장 실패: ${costErr.message}` }
  }

  // product_prices insert (있는 것만)
  const prices = [
    { price_type: 'normal',       price: input.selling_price },
    { price_type: 'siksiki',      price: input.siksiki_price },
    { price_type: 'subscription', price: input.subscription_price },
    { price_type: 'bulk', price: input.bulk_price, bulk_min_quantity: input.bulk_min_quantity ?? null },
  ].filter((p) => p.price && p.price > 0)

  if (prices.length > 0) {
    await supabase.from('product_prices').insert(
      prices.map((p: any) => ({ product_id: product.id, price_type: p.price_type, price: p.price, bulk_min_quantity: p.bulk_min_quantity ?? null }))
    )
  }

  // product_stats 초기화
  await supabase.from('product_stats').upsert(
    { product_id: product.id, used_by_count: 0, avg_unit_price: input.selling_price ?? null },
    { onConflict: 'product_id' }
  )

  // 로그
  await logProduct(supabase, {
    product_id: product.id, user_id: ctx.user_id, user_type: ctx.user_type,
    action: 'create', after_data: { ...input, product_code },
  })

  revalidatePath('/products')
  return { success: true, data: { id: product.id, product_code: product.product_code } }
}

// ── 매입가 변경 (이력 유지) ───────────────────────────────────

export async function updateCostPrice(input: {
  product_id: string
  new_cost_price: number
  start_date: string  // YYYY-MM-DD
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 현재 적용 중인 cost 조회
  const { data: current } = await supabase
    .from('product_costs')
    .select('id, cost_price')
    .eq('product_id', input.product_id)
    .is('end_date', null)
    .single()

  if (current) {
    // 기존 end_date = new start_date - 1일
    const endDate = new Date(input.start_date)
    endDate.setDate(endDate.getDate() - 1)
    await supabase.from('product_costs')
      .update({ end_date: endDate.toISOString().slice(0, 10) })
      .eq('id', current.id)
  }

  // 새 cost insert
  const { error } = await supabase.from('product_costs').insert({
    product_id: input.product_id,
    cost_price: input.new_cost_price,
    start_date: input.start_date,
    end_date: null,
  })
  if (error) return { success: false, error: error.message }

  await logProduct(supabase, {
    product_id: input.product_id, user_id: ctx.user_id, user_type: ctx.user_type,
    action: 'cost_change',
    before_data: current ? { cost_price: current.cost_price } : undefined,
    after_data: { cost_price: input.new_cost_price, start_date: input.start_date },
  })

  revalidatePath('/products')
  return { success: true }
}

// ── 상품 수정 ─────────────────────────────────────────────────

export interface UpdateProductInput {
  id: string
  name?: string
  tax_type?: 'taxable' | 'exempt'
  category_id?: string | null
  supplier_id?: string | null
  barcode?: string
  min_margin_rate?: number | null
  selling_price?: number
  siksiki_price?: number
  subscription_price?: number
  bulk_price?: number
  bulk_min_quantity?: number
}

export async function updateProduct(input: UpdateProductInput): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: before } = await supabase
    .from('products')
    .select('name, tax_type, category_id, supplier_id, min_margin_rate')
    .eq('id', input.id)
    .eq('tenant_id', ctx.tenant_id)
    .single()
  if (!before) return { success: false, error: '상품을 찾을 수 없습니다.' }

  const payload: Record<string, any> = {}
  if (input.name !== undefined)           payload.name = input.name.trim()
  if (input.tax_type !== undefined)        payload.tax_type = input.tax_type
  if (input.category_id !== undefined)     payload.category_id = input.category_id
  if (input.supplier_id !== undefined)     payload.supplier_id = input.supplier_id
  if (input.barcode !== undefined)         payload.barcode = input.barcode?.trim() || null
  if (input.min_margin_rate !== undefined) payload.min_margin_rate = input.min_margin_rate

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from('products')
      .update(payload).eq('id', input.id).eq('tenant_id', ctx.tenant_id)
    if (error) return { success: false, error: error.message }
  }

  // 가격 upsert
  const priceUpdates = [
    { price_type: 'normal',       price: input.selling_price },
    { price_type: 'siksiki',      price: input.siksiki_price },
    { price_type: 'subscription', price: input.subscription_price },
    { price_type: 'bulk',         price: input.bulk_price },
  ].filter((p) => p.price !== undefined)

  for (const p of priceUpdates) {
    await supabase.from('product_prices').upsert(
      { product_id: input.id, price_type: p.price_type, price: p.price },
      { onConflict: 'product_id,price_type' }
    )
  }

  // 가격 변경과 상품정보 변경 로그 분리
  const priceChanged = priceUpdates.length > 0
  const infoChanged = Object.keys(payload).length > 0

  if (infoChanged) {
    await logProduct(supabase, {
      product_id: input.id, user_id: ctx.user_id, user_type: ctx.user_type,
      action: 'update', before_data: before, after_data: payload,
    })
  }
  if (priceChanged) {
    const priceAfter = Object.fromEntries(priceUpdates.map((p) => [p.price_type, p.price]))
    await logProduct(supabase, {
      product_id: input.id, user_id: ctx.user_id, user_type: ctx.user_type,
      action: 'price_change',
      before_data: { prices: Object.fromEntries(
        priceUpdates.map((p) => [p.price_type, (before as any)[p.price_type] ?? null])
      )},
      after_data: { prices: priceAfter },
    })
  }

  revalidatePath('/products')
  return { success: true }
}

// ── 상품 목록 조회 ─────────────────────────────────────────────

export interface ProductListItem {
  id: string
  product_code: string
  name: string
  tax_type: 'taxable' | 'exempt'
  category_id: string | null
  category_name: string | null
  supplier_id: string | null
  supplier_name: string | null
  barcode: string | null
  min_margin_rate: number | null
  cost_price: number
  selling_price: number | null
  siksiki_price: number | null
  subscription_price: number | null
  bulk_price: number | null
  avg_unit_price: number | null
  used_by_count: number
}

export async function getProducts(filters?: {
  category_id?: string
  supplier_id?: string
  tax_type?: string
  min_price?: number
  max_price?: number
  q?: string
}): Promise<ActionResult<ProductListItem[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('products')
    .select(`
      id, product_code, name, tax_type, category_id, supplier_id, barcode, min_margin_rate,
      product_categories ( name ),
      customers!supplier_id ( name ),
      product_costs ( cost_price, end_date ),
      product_prices ( price_type, price ),
      product_stats ( avg_unit_price, used_by_count )
    `)
    .is('deleted_at', null)
    .order('name')

  if (filters?.category_id) query = query.eq('category_id', filters.category_id)
  if (filters?.supplier_id) query = query.eq('supplier_id', filters.supplier_id)
  if (filters?.tax_type)    query = query.eq('tax_type', filters.tax_type)
  if (filters?.q)           query = query.ilike('name', `%${filters.q}%`)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  const items: ProductListItem[] = (data ?? []).map((p: any) => {
    const currentCost = (p.product_costs ?? []).find((c: any) => c.end_date === null)?.cost_price ?? 0
    const priceMap = Object.fromEntries((p.product_prices ?? []).map((pp: any) => [pp.price_type, pp.price]))
    return {
      id: p.id,
      product_code: p.product_code,
      name: p.name,
      tax_type: p.tax_type,
      category_id: p.category_id,
      category_name: p.product_categories?.name ?? null,
      supplier_id: p.supplier_id,
      supplier_name: p.customers?.name ?? null,
      barcode: p.barcode,
      min_margin_rate: p.min_margin_rate,
      cost_price: currentCost,
      selling_price: priceMap.normal ?? null,
      siksiki_price: priceMap.siksiki ?? null,
      subscription_price: priceMap.subscription ?? null,
      bulk_price: priceMap.bulk ?? null,
      avg_unit_price: p.product_stats?.avg_unit_price ?? null,
      used_by_count: p.product_stats?.used_by_count ?? 0,
    }
  })

  // 가격 범위 필터 (메모리)
  const filtered = filters?.min_price || filters?.max_price
    ? items.filter((p) => {
        const price = p.selling_price ?? 0
        if (filters.min_price && price < filters.min_price) return false
        if (filters.max_price && price > filters.max_price) return false
        return true
      })
    : items

  return { success: true, data: filtered }
}

// ── 사용처 조회 ───────────────────────────────────────────────

export interface ProductUser {
  customer_id: string
  customer_name: string
  last_unit_price: number | null
}

export async function getProductUsers(product_id: string): Promise<ActionResult<ProductUser[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customer_product_prices')
    .select('customer_id, last_price, customers ( name )')
    .eq('product_id', product_id)
    .order('last_price', { ascending: false })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      customer_id: r.customer_id,
      customer_name: r.customers?.name ?? '-',
      last_unit_price: r.last_price,
    })),
  }
}





// ============================================================
// 상품 대량등록 — bulk_create_products RPC (완전 트랜잭션)
// 중간 실패 시 PostgreSQL이 전체 rollback. orphan 데이터 없음.
// ============================================================

const BULK_MAX_ROWS = 500

export interface BulkProductRow {
  name:                string
  cost_price:          number | string
  selling_price:       number | string
  siksiki_price?:      number | string
  subscription_price?: number | string
  bulk_price?:         number | string
  bulk_min_quantity?:  number | string
  tax_type:            string
  category_name?:      string
}

export interface BulkProductResult {
  success_count: number
  fail_count:    number
  fail_rows:     Array<{ row: number; name: string; field: string; reason: string }>
}

// 숫자 파싱: "1,200" → 1200, 공백 제거, NaN → undefined
function parseNum(v: number | string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(String(v).replace(/,/g, '').trim())
  return isNaN(n) ? undefined : n
}

export async function bulkCreateProducts(
  rows: BulkProductRow[],
): Promise<ActionResult<BulkProductResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (!rows.length) return { success: false, error: '등록할 상품이 없습니다.' }
  if (rows.length > BULK_MAX_ROWS)
    return { success: false, error: `최대 ${BULK_MAX_ROWS}건까지 한번에 등록할 수 있습니다.` }

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const fail_rows: BulkProductResult['fail_rows'] = []

  // ── 1. 유효성 검사 ────────────────────────────────────────
  const validRows: Array<{ rowNum: number; data: BulkProductRow }> = []
  rows.forEach((r, i) => {
    const rowNum = i + 1
    if (!r.name?.trim()) {
      fail_rows.push({ row: rowNum, name: r.name ?? '', field: 'name', reason: '상품명 필수' }); return
    }
    const cost = parseNum(r.cost_price)
    if (cost === undefined || cost <= 0) {
      fail_rows.push({ row: rowNum, name: r.name, field: 'cost_price', reason: '매입가 필수 (양의 숫자)' }); return
    }
    const price = parseNum(r.selling_price)
    if (price === undefined || price <= 0) {
      fail_rows.push({ row: rowNum, name: r.name, field: 'selling_price', reason: '판매가 필수 (양의 숫자)' }); return
    }
    const tax = r.tax_type?.trim().toLowerCase()
    if (!['taxable', 'exempt'].includes(tax)) {
      fail_rows.push({ row: rowNum, name: r.name, field: 'tax_type', reason: 'taxable 또는 exempt만 가능' }); return
    }
    validRows.push({ rowNum, data: { ...r, tax_type: tax } })
  })

  if (!validRows.length)
    return { success: true, data: { success_count: 0, fail_count: fail_rows.length, fail_rows } }

  // ── 2. category batch 조회 + ON CONFLICT DO NOTHING 생성 ──
  const categoryNames = [...new Set(
    validRows.map((r) => r.data.category_name?.trim()).filter(Boolean) as string[]
  )]
  const categoryMap = new Map<string, string>()

  if (categoryNames.length > 0) {
    const { data: existing } = await supabase
      .from('product_categories')
      .select('id, name')
      .eq('tenant_id', ctx.tenant_id)
      .in('name', categoryNames)
    for (const c of existing ?? []) categoryMap.set(c.name, c.id)

    const missing = categoryNames.filter((n) => !categoryMap.has(n))
    if (missing.length > 0) {
      const { data: created } = await supabase
        .from('product_categories')
        .upsert(
          missing.map((name) => ({ tenant_id: ctx.tenant_id, name })),
          { onConflict: 'tenant_id,name', ignoreDuplicates: false }
        )
        .select('id, name')
      for (const c of created ?? []) categoryMap.set(c.name, c.id)
    }
  }

  // ── 3. product_code sequence로 N개 채번 ───────────────────
  const n = validRows.length
  const { data: seqNums, error: seqErr } = await supabase
    .rpc('nextval_product_code_n', { n })
  if (seqErr || !seqNums?.length)
    return { success: false, error: `코드 채번 실패: ${seqErr?.message}` }

  // ── 4. RPC 페이로드 조립 ──────────────────────────────────
  const payload = validRows.map((r, i) => {
    const cost  = parseNum(r.data.cost_price)!
    const prices: any[] = []
    const addPrice = (price_type: string, v?: number | string, bulk_min_quantity?: number | string) => {
      const p = parseNum(v)
      if (p && p > 0) {
        const qty = parseNum(bulk_min_quantity)
        prices.push({ price_type, price: p, bulk_min_quantity: qty ? Math.max(1, Math.floor(qty)) : null })
      }
    }
    addPrice('normal',       r.data.selling_price)
    addPrice('siksiki',      r.data.siksiki_price)
    addPrice('subscription', r.data.subscription_price)
    addPrice('bulk',         r.data.bulk_price, r.data.bulk_min_quantity)

    return {
      product_code: `P${String(seqNums[i]).padStart(4, '0')}`,
      name:         r.data.name.trim(),
      tax_type:     r.data.tax_type,
      category_id:  r.data.category_name?.trim()
                      ? (categoryMap.get(r.data.category_name.trim()) ?? '')
                      : '',
      cost_price:   cost,
      prices,
    }
  })

  // ── 5. RPC 단일 호출 — 완전 트랜잭션 ─────────────────────
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('bulk_create_products', {
    p_tenant_id: ctx.tenant_id,
    p_user_id:   ctx.user_id,
    p_user_type: ctx.user_type ?? 'human',
    p_today:     today,
    p_products:  JSON.stringify(payload),
  })

  if (rpcErr || !rpcResult)
    return { success: false, error: `저장 실패 (전체 rollback됨): ${rpcErr?.message}` }

  revalidatePath('/products')
  return {
    success: true,
    data: {
      success_count: rpcResult.inserted ?? validRows.length,
      fail_count:    fail_rows.length,
      fail_rows,
    },
  }
}

// ============================================================
// 상품 복사용 단건 조회
// ============================================================
export interface ProductCopyData {
  name:           string
  product_code:   string
  category_id:    string | null
  supplier_id:    string | null
  tax_type:       'taxable' | 'exempt'
  barcode:        string | null
  cost_price:     number
  selling_price:  number
  min_margin_rate: number | null
  unit:           string | null
  spec:           string | null
  memo:           string | null
}

export async function getProductById(
  id: string
): Promise<ActionResult<ProductCopyData>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('products')
    .select('name, product_code, category_id, supplier_id, tax_type, barcode, cost_price, selling_price, min_margin_rate, unit, spec, memo')
    .eq('id', id)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return { success: false, error: '상품을 찾을 수 없습니다.' }

  return { success: true, data: data as ProductCopyData }
}