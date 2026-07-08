'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult, ProductForOrder } from '@/types/order'
import { effectiveOrderAmount } from '@/lib/ledger-calc'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'

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
  ingredients?: string
  item_report_number?: string
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
      ingredients: input.ingredients?.trim() || null,
      item_report_number: input.item_report_number?.trim() || null,
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

export async function createProductQuick(input: {
  name: string
  cost_price: number
  sale_price?: number | null
  unit?: string | null
}): Promise<{ success: boolean; product?: ProductForOrder; error?: string }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const name = input.name.trim()
  if (!name) return { success: false, error: '상품명을 입력해주세요.' }
  if (!input.cost_price || input.cost_price <= 0) {
    return { success: false, error: '매입가를 입력해주세요.' }
  }

  const salePrice =
    input.sale_price != null && Number.isFinite(input.sale_price) && input.sale_price > 0
      ? Math.floor(input.sale_price)
      : null

  let seqNum: number | null = null
  try {
    const { data: seqData } = await supabase.rpc('nextval_product_code')
    seqNum = seqData ?? null
  } catch {
    // sequence RPC 없으면 fallback
  }
  if (seqNum === null) {
    const { data: lastProduct } = await supabase
      .from('products')
      .select('product_code')
      .eq('tenant_id', ctx.tenant_id)
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
      name,
      tax_type: 'taxable',
      unit: input.unit?.trim() || null,
      procurement_type: 'consignment',
    })
    .select('id, product_code, name, tax_type, procurement_type')
    .single()

  if (pErr || !product) {
    return { success: false, error: `상품 저장 실패: ${pErr?.message ?? '알 수 없는 오류'}` }
  }

  const today = new Date().toISOString().slice(0, 10)

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

  if (salePrice != null) {
    await supabase.from('product_prices').insert({
      product_id: product.id,
      price_type: 'normal',
      price: salePrice,
    })
  }

  await supabase.from('product_stats').upsert(
    { product_id: product.id, used_by_count: 0, avg_unit_price: salePrice },
    { onConflict: 'product_id' },
  )

  await logProduct(supabase, {
    product_id: product.id,
    user_id: ctx.user_id,
    user_type: ctx.user_type,
    action: 'create',
    after_data: { name, cost_price: input.cost_price, sale_price: salePrice, unit: input.unit ?? null, product_code, quick: true },
  })

  revalidatePath('/products')

  const productForOrder: ProductForOrder = {
    id: product.id,
    product_code: product.product_code,
    name: product.name,
    tax_type: product.tax_type as 'taxable' | 'exempt',
    procurement_type: product.procurement_type,
    fulfillment_type: 'consignment',
    current_cost_price: input.cost_price,
    last_unit_price: salePrice ?? 0,
    has_purchase_history: false,
    last_pricing_mode: null,
    last_line_total: null,
    last_qty: null,
  }

  return { success: true, product: productForOrder }
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

  if (priceUpdates.length > 0) {
    const rows = priceUpdates.map((p) => ({
      product_id: input.id,
      price_type: p.price_type,
      price: p.price,
    }))
    await supabase.from('product_prices').upsert(rows, { onConflict: 'product_id,price_type' })
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
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

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
    .eq('tenant_id', ctx.tenant_id)
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

async function allocateProductCode(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  tenant_id: string,
): Promise<string> {
  let seqNum: number | null = null
  try {
    const { data: seqData } = await supabase.rpc('nextval_product_code')
    seqNum = seqData ?? null
  } catch {
    // sequence RPC 없으면 fallback
  }
  if (seqNum === null) {
    const { data: lastProduct } = await supabase
      .from('products')
      .select('product_code')
      .eq('tenant_id', tenant_id)
      .like('product_code', 'P%')
      .order('product_code', { ascending: false })
      .limit(1)
      .single()
    seqNum = lastProduct?.product_code
      ? (parseInt(lastProduct.product_code.replace(/[^0-9]/g, ''), 10) || 0) + 1
      : 1
  }
  return `P${String(seqNum).padStart(4, '0')}`
}

export async function copyProduct(
  productId: string,
): Promise<{ success: boolean; newId?: string; error?: string }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '인증 필요' }

  const { data: original, error: fetchErr } = await supabase
    .from('products')
    .select(`
      name, tax_type, category_id, supplier_id, barcode, ingredients,
      item_report_number, min_margin_rate, procurement_type, unit, spec, memo,
      storage_condition, status,
      product_costs ( cost_price, start_date, end_date ),
      product_prices ( price_type, price, bulk_min_quantity )
    `)
    .eq('id', productId)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !original) {
    return { success: false, error: '상품을 찾을 수 없습니다' }
  }

  const product_code = await allocateProductCode(supabase, ctx.tenant_id)
  const newName = `${original.name} (복사)`

  const { data: newProduct, error: productError } = await supabase
    .from('products')
    .insert({
      tenant_id: ctx.tenant_id,
      product_code,
      name: newName,
      tax_type: original.tax_type,
      category_id: original.category_id,
      supplier_id: original.supplier_id,
      barcode: null,
      ingredients: original.ingredients,
      item_report_number: original.item_report_number,
      min_margin_rate: original.min_margin_rate,
      procurement_type: original.procurement_type ?? 'consignment',
      unit: original.unit,
      spec: original.spec,
      memo: original.memo,
      storage_condition: original.storage_condition,
      status: original.status,
    })
    .select('id, product_code')
    .single()

  if (productError || !newProduct) {
    return { success: false, error: productError?.message ?? '상품 복사 실패' }
  }

  const today = new Date().toISOString().slice(0, 10)
  const activeCosts = (original.product_costs ?? []).filter((c: { end_date: string | null }) => c.end_date === null)
  const costsToCopy = activeCosts.length > 0 ? activeCosts : (original.product_costs ?? []).slice(0, 1)

  if (costsToCopy.length > 0) {
    const { error: costErr } = await supabase.from('product_costs').insert(
      costsToCopy.map((c: { cost_price: number }) => ({
        product_id: newProduct.id,
        cost_price: c.cost_price,
        start_date: today,
        end_date: null,
      })),
    )
    if (costErr) {
      await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', newProduct.id)
      return { success: false, error: costErr.message }
    }
  }

  const prices = original.product_prices ?? []
  if (prices.length > 0) {
    const { error: priceErr } = await supabase.from('product_prices').insert(
      prices.map((p: { price_type: string; price: number; bulk_min_quantity?: number | null }) => ({
        product_id: newProduct.id,
        price_type: p.price_type,
        price: p.price,
        bulk_min_quantity: p.bulk_min_quantity ?? null,
      })),
    )
    if (priceErr) {
      await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', newProduct.id)
      return { success: false, error: priceErr.message }
    }
  }

  const priceMap = Object.fromEntries(prices.map((p: { price_type: string; price: number }) => [p.price_type, p.price]))
  await supabase.from('product_stats').upsert(
    { product_id: newProduct.id, used_by_count: 0, avg_unit_price: priceMap.normal ?? null },
    { onConflict: 'product_id' },
  )

  await logProduct(supabase, {
    product_id: newProduct.id,
    user_id: ctx.user_id,
    user_type: ctx.user_type,
    action: 'copy',
    before_data: { source_product_id: productId, source_name: original.name },
    after_data: { id: newProduct.id, product_code: newProduct.product_code, name: newName },
  })

  revalidatePath('/products')
  return { success: true, newId: newProduct.id }
}

// ============================================================
// SUP-MISSING-009: 상품 상세(탭) 데이터
// ============================================================

export interface ProductDetail {
  id: string
  product_code: string
  name: string
  category_id: string | null
  category_name: string | null
  unit: string | null
  spec: string | null
  barcode: string | null
  storage_condition: string | null
  status: string | null
  memo: string | null
  ingredients: string | null
  item_report_number: string | null
  selling_price: number | null
  min_margin_rate: number | null
  current_cost_price: number | null
}

export async function getProductDetail(
  product_id: string,
): Promise<ActionResult<ProductDetail>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, product_code, name, category_id, unit, spec, barcode,
      storage_condition, status, memo, ingredients, item_report_number,
      min_margin_rate,
      product_categories(name),
      product_costs(cost_price, start_date, end_date, created_at),
      product_prices(price_type, price)
    `)
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', product_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: '상품을 찾을 수 없습니다.' }

  const currentCost = (data.product_costs ?? [])
    .filter((c: any) => c.end_date === null)
    .sort((a: any, b: any) => String(b.start_date).localeCompare(String(a.start_date)))[0]
    ?.cost_price ?? null

  const priceMap = Object.fromEntries((data.product_prices ?? []).map((pp: any) => [pp.price_type, pp.price]))

  const cat = (data as any).product_categories
  const category_name =
    Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null)

  return {
    success: true,
    data: {
      id: data.id,
      product_code: data.product_code,
      name: data.name,
      category_id: data.category_id,
      category_name,
      unit: data.unit ?? null,
      spec: data.spec ?? null,
      barcode: data.barcode ?? null,
      storage_condition: (data as any).storage_condition ?? null,
      status: (data as any).status ?? null,
      memo: data.memo ?? null,
      ingredients: (data as any).ingredients ?? null,
      item_report_number: (data as any).item_report_number ?? null,
      selling_price: priceMap.normal ?? null,
      min_margin_rate: data.min_margin_rate ?? null,
      current_cost_price: currentCost,
    },
  }
}

export interface ProductCostHistoryRow {
  id: string
  start_date: string
  end_date: string | null
  cost_price: number
  created_at: string
}

export async function getProductCostHistory(
  product_id: string,
): Promise<ActionResult<ProductCostHistoryRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('product_costs')
    .select('id, start_date, end_date, cost_price, created_at')
    .eq('tenant_id', ctx.tenant_id)
    .eq('product_id', product_id)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as ProductCostHistoryRow[] }
}

export interface CustomerPriceRow {
  customer_id: string
  customer_name: string
  unit_price: number | null
  pricing_mode: string | null
  updated_at: string | null
  source: 'order'
}

export async function getCustomerProductPrices(
  product_id: string,
): Promise<ActionResult<CustomerPriceRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customer_product_prices')
    .select('customer_id, last_price, last_pricing_mode, updated_at, customers(name)')
    .eq('tenant_id', ctx.tenant_id)
    .eq('product_id', product_id)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      customer_id: r.customer_id,
      customer_name: r.customers?.name ?? '-',
      unit_price: r.last_price ?? null,
      pricing_mode: r.last_pricing_mode ?? null,
      updated_at: r.updated_at ?? null,
      source: 'order',
    })),
  }
}

export interface ManualRelatedRow {
  id: string
  related_product_id: string
  related_product_name: string
  is_active: boolean
  created_at: string
}

// NOTE: 테이블명은 운영 SSOT에 의존 (migration 없음). 없으면 빈 목록 반환.
const MANUAL_RELATED_TABLE = 'product_related_manual'

export async function getProductRelatedManual(
  product_id: string,
): Promise<ActionResult<ManualRelatedRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const { data, error } = await supabase
      .from(MANUAL_RELATED_TABLE)
      .select('id, related_product_id, is_active, created_at, products!related_product_id(name)')
      .eq('tenant_id', ctx.tenant_id)
      .eq('product_id', product_id)
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }
    return {
      success: true,
      data: (data ?? []).map((r: any) => ({
        id: r.id,
        related_product_id: r.related_product_id,
        related_product_name: Array.isArray(r.products)
          ? (r.products[0]?.name ?? '-')
          : ((r.products as any)?.name ?? '-'),
        is_active: r.is_active ?? true,
        created_at: r.created_at,
      })),
    }
  } catch (e) {
    // 테이블 부재 등: UI에서 안내 문구를 표시할 수 있도록 빈 목록으로 성공 반환
    return { success: true, data: [] }
  }
}

export async function addRelatedProduct(
  product_id: string,
  related_id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (!related_id) return { success: false, error: 'related_id 필수' }
  if (related_id === product_id) return { success: false, error: '동일 상품은 등록할 수 없습니다.' }

  const { data, error } = await supabase
    .from(MANUAL_RELATED_TABLE)
    .insert({
      tenant_id: ctx.tenant_id,
      product_id,
      related_product_id: related_id,
      is_active: true,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath(`/products/${product_id}`)
  return { success: true, data: { id: data.id } }
}

export async function removeRelatedProduct(id: string, product_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from(MANUAL_RELATED_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/products/${product_id}`)
  return { success: true }
}

export interface UsagePatternResult {
  trade_count: number
  top_customers: Array<{ customer_id: string; customer_name: string; order_count: number }>
  co_purchase_top: Array<{ product_name: string; count: number }>
  monthly_qty_6m: Array<{ ym: string; qty: number }>
  avg_order_qty: number | null
  data_ok: boolean
}

export async function getProductUsagePattern(
  product_id: string,
): Promise<ActionResult<UsagePatternResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 최근 6개월 범위 (KST day 기준)
  const now = new Date(Date.now() + 9 * 3600000)
  const to = now.toISOString().slice(0, 10)
  const fromDate = new Date(now)
  fromDate.setUTCMonth(fromDate.getUTCMonth() - 5)
  fromDate.setUTCDate(1)
  const from = fromDate.toISOString().slice(0, 10)

  // 1) 이 상품이 포함된 주문 라인 (order_lines 스냅샷 기반)
  const { data: lines, error: lErr } = await supabase
    .from('order_lines')
    .select('order_id, quantity')
    .eq('tenant_id', ctx.tenant_id)
    .eq('product_id', product_id)
    .gte('created_at', from)
    .limit(5000)

  if (lErr) return { success: false, error: lErr.message }
  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))].filter(Boolean)

  if (orderIds.length === 0) {
    return {
      success: true,
      data: {
        trade_count: 0,
        top_customers: [],
        co_purchase_top: [],
        monthly_qty_6m: [],
        avg_order_qty: null,
        data_ok: false,
      },
    }
  }

  // 2) 주문 헤더(confirmed, 범위 내) + customer
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_date, customer_id, customers(name), status')
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .in('id', orderIds)
    .eq('status', 'confirmed')
    .gte('order_date', from)
    .lte('order_date', to)

  if (oErr) return { success: false, error: oErr.message }
  const confirmedIds = new Set((orders ?? []).map((o) => o.id))

  // trade_count: confirmed 주문 기준
  const trade_count = confirmedIds.size
  const data_ok = trade_count >= 10

  // 월별 판매량(수량) + 평균 주문 수량(이 상품 라인 qty 평균)
  const monthly = new Map<string, number>()
  let qtySum = 0
  let qtyCnt = 0
  for (const o of orders ?? []) {
    const ym = String(o.order_date ?? '').slice(0, 7)
    if (!ym) continue
    // 해당 주문에서 해당 상품 라인 qty 합
    const q = (lines ?? [])
      .filter((l: any) => l.order_id === o.id)
      .reduce((s: number, r: any) => s + (r.quantity ?? 0), 0)
    monthly.set(ym, (monthly.get(ym) ?? 0) + q)
    if (q > 0) {
      qtySum += q
      qtyCnt += 1
    }
  }

  const monthly_qty_6m = [...monthly.entries()]
    .map(([ym, qty]) => ({ ym, qty }))
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .slice(-6)

  const avg_order_qty = qtyCnt > 0 ? Math.round((qtySum / qtyCnt) * 10) / 10 : null

  // TOP 거래처(주문 횟수)
  const byCust = new Map<string, { name: string; cnt: number }>()
  for (const o of orders ?? []) {
    const cid = o.customer_id
    if (!cid) continue
    const prev = byCust.get(cid)
    byCust.set(cid, {
      name: (o.customers as any)?.name ?? '-',
      cnt: (prev?.cnt ?? 0) + 1,
    })
  }
  const top_customers = [...byCust.entries()]
    .map(([customer_id, v]) => ({ customer_id, customer_name: v.name, order_count: v.cnt }))
    .sort((a, b) => b.order_count - a.order_count)
    .slice(0, 5)

  // 함께 구매 상품 TOP5 (same order, other product_name)
  const ids = (orders ?? []).map((o) => o.id)
  const { data: allLines, error: alErr } = await supabase
    .from('order_lines')
    .select('order_id, product_id, product_name')
    .eq('tenant_id', ctx.tenant_id)
    .in('order_id', ids)
    .limit(20000)
  if (alErr) return { success: false, error: alErr.message }

  const co = new Map<string, number>()
  for (const l of allLines ?? []) {
    if (!confirmedIds.has(l.order_id)) continue
    if (l.product_id === product_id) continue
    const key = l.product_name ?? '-'
    if (key === '-') continue
    co.set(key, (co.get(key) ?? 0) + 1)
  }
  const co_purchase_top = [...co.entries()]
    .map(([product_name, count]) => ({ product_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    success: true,
    data: {
      trade_count,
      top_customers,
      co_purchase_top,
      monthly_qty_6m,
      avg_order_qty,
      data_ok,
    },
  }
}

export interface AutoRecommendResult {
  enabled: boolean
  reason_disabled?: string
  recommendations: Array<{ product_name: string; score: number }>
  stats: { trade_count: number; co_purchase_count: number; distinct_customers: number }
}

export async function getProductAutoRecommend(
  product_id: string,
): Promise<ActionResult<AutoRecommendResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 최근 6개월 confirmed 주문 중 이 상품 포함 주문을 기반으로 조건/추천 계산
  const usage = await getProductUsagePattern(product_id)
  if (!usage.success || !usage.data) return usage as any

  const trade_count = usage.data.trade_count
  const distinct_customers = usage.data.top_customers.length > 0
    ? new Set(usage.data.top_customers.map((c) => c.customer_id)).size
    : 0
  const co_purchase_count = usage.data.co_purchase_top.reduce((s, r) => s + r.count, 0)

  const cond1 = trade_count >= 20
  const cond2 = co_purchase_count >= 30
  const cond3 = distinct_customers >= 5
  const ok = [cond1, cond2, cond3].filter(Boolean).length >= 2

  if (!ok) {
    return {
      success: true,
      data: {
        enabled: false,
        reason_disabled: '데이터가 더 쌓이면 자동 추천이 활성화됩니다',
        recommendations: [],
        stats: { trade_count, co_purchase_count, distinct_customers },
      },
    }
  }

  return {
    success: true,
    data: {
      enabled: true,
      recommendations: usage.data.co_purchase_top.map((r) => ({ product_name: r.product_name, score: r.count })),
      stats: { trade_count, co_purchase_count, distinct_customers },
    },
  }
}

export interface MarginAnalysis {
  selling_price: number | null
  current_cost_price: number | null
  current_margin_rate: number | null
  avg_unit_price: number | null
  avg_margin_rate: number | null
  threshold: number
}

export async function getProductMarginAnalysis(
  product_id: string,
): Promise<ActionResult<MarginAnalysis>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const [detailRes, settingsRes, { data: stats, error: sErr }] = await Promise.all([
    getProductDetail(product_id),
    getSettings(),
    supabase
      .from('product_stats')
      .select('avg_unit_price')
      .eq('tenant_id', ctx.tenant_id)
      .eq('product_id', product_id)
      .maybeSingle(),
  ])

  if (!detailRes.success || !detailRes.data) return detailRes as any
  if (sErr) return { success: false, error: sErr.message }

  const selling_price = detailRes.data.selling_price
  const current_cost_price = detailRes.data.current_cost_price
  const current_margin_rate =
    selling_price && current_cost_price !== null && selling_price > 0
      ? ((selling_price - current_cost_price) / selling_price) * 100
      : null

  const avg_unit_price = (stats as any)?.avg_unit_price ?? null
  const avg_margin_rate =
    avg_unit_price && current_cost_price !== null && avg_unit_price > 0
      ? ((avg_unit_price - current_cost_price) / avg_unit_price) * 100
      : null

  const thresholdDefault =
    settingsRes.success && settingsRes.data
      ? settingsRes.data.margin_warning_threshold
      : DEFAULT_SETTINGS.margin_warning_threshold
  const threshold = detailRes.data.min_margin_rate ?? thresholdDefault

  return {
    success: true,
    data: {
      selling_price,
      current_cost_price,
      current_margin_rate,
      avg_unit_price,
      avg_margin_rate,
      threshold,
    },
  }
}