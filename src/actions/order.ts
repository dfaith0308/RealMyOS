'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import { calcLine, calcOrderTotals, formatOrderNumber } from '@/lib/calc'
import { linkActionResult } from '@/actions/action-log'
import type {
  CreateOrderInput,
  ActionResult,
  CreatedOrder,
  CustomerForOrder,
  ProductForOrder,
} from '@/types/order'

// ============================================================
// 공통 헬퍼
// ============================================================

async function getCtx(supabase: any) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: me } = await supabase
    .from('users').select('tenant_id, user_type').eq('id', user.id).single()
  if (!me?.tenant_id) return null
  return { user_id: user.id, tenant_id: me.tenant_id, user_type: me.user_type ?? 'human' }
}

async function logOrder(supabase: any, opts: {
  order_id: string; user_id: string; user_type: string
  action: 'create' | 'update' | 'cancel'
  before_data?: object | null
  after_data?: object | null
}) {
  await supabase.from('order_logs').insert({
    order_id:    opts.order_id,
    user_id:     opts.user_id,
    user_type:   opts.user_type,
    action:      opts.action,
    before_data: opts.before_data ?? null,
    after_data:  opts.after_data  ?? null,
  })
}

function getCurrentCostPrice(
  costs: Array<{ cost_price: number; start_date: string; end_date: string | null }>,
  date: string,
): number {
  const valid = costs
    .filter((c) => c.start_date <= date && (c.end_date === null || c.end_date >= date))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  return valid[0]?.cost_price ?? 0
}

function defaultFulfillment(procurement_type: string): 'stock' | 'consignment' {
  return procurement_type === 'stock' ? 'stock' : 'consignment'
}

async function issueOrderNumber(
  supabase: any, tenant_id: string, dateStr: string,
): Promise<string> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('order_date', dateStr)
  return formatOrderNumber(new Date(dateStr), (count ?? 0) + 1)
}

async function getLockDays(supabase: any, tenant_id: string): Promise<number> {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'order_edit_lock_days')
    .eq('tenant_id', tenant_id)   // tenant_id 필터 필수
    .single()
  return data ? parseInt(data.value, 10) : 7
}

// ============================================================
// 주문 생성
// ============================================================

export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<CreatedOrder>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  if (!input.customer_id) return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.lines?.length) return { success: false, error: '상품을 1개 이상 추가해주세요.' }

  const { data: customer } = await supabase
    .from('customers').select('id')
    .eq('id', input.customer_id).eq('tenant_id', ctx.tenant_id).is('deleted_at', null).single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처입니다.' }

  const productIds = [...new Set(input.lines.map((l) => l.product_id))]
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, product_code, name, tax_type, procurement_type, product_costs(cost_price,start_date,end_date)')
    .in('id', productIds).eq('tenant_id', ctx.tenant_id).is('deleted_at', null)
  if (prodErr || !products || products.length !== productIds.length)
    return { success: false, error: '상품 정보 조회 실패.' }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const orderDate  = input.order_date || new Date().toISOString().slice(0, 10)

  const lineRows = input.lines.map((line) => {
    const product   = productMap.get(line.product_id)!
    const cost_price = getCurrentCostPrice(product.product_costs ?? [], orderDate)
    const tax_type   = product.tax_type as 'taxable' | 'exempt'
    const calc       = calcLine(line.unit_price, line.quantity, tax_type)
    return {
      product_id:       line.product_id,
      product_code:     product.product_code,
      product_name:     product.name,
      unit_price:       line.unit_price,
      cost_price,
      fulfillment_type: line.fulfillment_type ?? defaultFulfillment(product.procurement_type),
      quantity:         line.quantity,
      supply_price:     calc.supply_price,
      vat_amount:       calc.vat_amount,
      line_total:       calc.line_total,
      tax_type,
    }
  })

  const totals      = calcOrderTotals(lineRows)
  const orderNumber = await issueOrderNumber(supabase, ctx.tenant_id, orderDate)

  const { data: newOrder, error: orderErr } = await supabase
    .from('orders')
    .insert({
      tenant_id:          ctx.tenant_id,
      customer_id:        input.customer_id,
      order_number:       orderNumber,
      order_date:         orderDate,
      status:             input.status ?? 'confirmed',
      total_supply_price: totals.total_supply_price,
      total_vat_amount:   totals.total_vat_amount,
      total_amount:       totals.total_amount,
      memo:               input.memo ?? null,
      created_by:         ctx.user_id,
    })
    .select('id, order_number, total_amount')
    .single()
  if (orderErr || !newOrder) return { success: false, error: `주문 생성 실패: ${orderErr?.message}` }

  const { error: linesErr } = await supabase
    .from('order_lines')
    .insert(lineRows.map((r) => ({ order_id: newOrder.id, ...r })))
  if (linesErr) {
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', newOrder.id)
    return { success: false, error: `라인 저장 실패: ${linesErr.message}` }
  }

  // 거래처별 마지막 판매가 캐시
  await supabase.from('customer_product_prices').upsert(
    lineRows.map((r) => ({
      customer_id: input.customer_id,
      product_id:  r.product_id,
      last_price:  r.unit_price,
      updated_at:  new Date().toISOString(),
    })),
    { onConflict: 'customer_id,product_id' }
  )

  // order_logs: create
  await logOrder(supabase, {
    order_id:   newOrder.id,
    user_id:    ctx.user_id,
    user_type:  ctx.user_type,
    action:     'create',
    before_data: null,
    after_data:  { order_number: newOrder.order_number, total_amount: totals.total_amount, lines: lineRows },
  })

  await linkActionResult({
    customer_id:      input.customer_id,
    tenant_id:        ctx.tenant_id,
    result_type:      'order_created',
    result_amount:    totals.total_amount,
    related_order_id: newOrder.id,
  })

  revalidatePath('/orders')
  revalidateTag('customers-balance')
  return { success: true, data: { order_id: newOrder.id, order_number: newOrder.order_number, total_amount: newOrder.total_amount } }
}

// ============================================================
// 주문 수정
// ============================================================

export interface UpdateOrderInput {
  order_id:   string
  lines:      Array<{
    product_id: string; product_code: string; product_name: string
    quantity: number; unit_price: number; cost_price: number
    tax_type: 'taxable' | 'exempt'; fulfillment_type: 'stock' | 'consignment'
  }>
  order_date?: string
  memo?:       string
}

export async function updateOrder(input: UpdateOrderInput): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 입력값 방어
  if (!input.lines || input.lines.length === 0)
    return { success: false, error: '상품을 1개 이상 포함해야 합니다.' }

  // 주문 조회 (tenant 격리)
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, order_date, created_at, total_supply_price, total_vat_amount, total_amount, memo')
    .eq('id', input.order_id).eq('tenant_id', ctx.tenant_id).is('deleted_at', null).single()
  if (!order)                       return { success: false, error: '주문을 찾을 수 없습니다.' }
  if (order.status === 'cancelled') return { success: false, error: '취소된 주문은 수정할 수 없습니다.' }

  // 수정 잠금
  const lockDays = await getLockDays(supabase, ctx.tenant_id)
  const diffDays = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 86400000)
  if (diffDays > lockDays)
    return { success: false, error: `주문 수정 가능 기간이 지나 수정할 수 없습니다. (${lockDays}일 초과)` }

  // before_data 스냅샷
  const { data: beforeLines } = await supabase
    .from('order_lines').select('*').eq('order_id', input.order_id)
  const beforeData = { order, lines: beforeLines ?? [] }

  // 라인 계산
  const lineRows = input.lines.map((l) => {
    const calc = calcLine(l.unit_price, l.quantity, l.tax_type)
    return {
      product_id:       l.product_id,
      product_code:     l.product_code,
      product_name:     l.product_name,
      unit_price:       l.unit_price,
      cost_price:       l.cost_price,
      tax_type:         l.tax_type,
      fulfillment_type: l.fulfillment_type,
      quantity:         l.quantity,
      supply_price:     calc.supply_price,
      vat_amount:       calc.vat_amount,
      line_total:       calc.line_total,
    }
  })

  // delete + insert atomic (RPC)
  const { error: rpcErr } = await supabase.rpc('update_order_lines', {
    p_order_id:  input.order_id,
    p_tenant_id: ctx.tenant_id,
    p_line_rows: JSON.stringify(lineRows),
  })
  if (rpcErr) return { success: false, error: `라인 저장 실패: ${rpcErr.message}` }

  const newTotals = lineRows.reduce(
    (s, r) => ({ total_supply_price: s.total_supply_price + r.supply_price, total_vat_amount: s.total_vat_amount + r.vat_amount, total_amount: s.total_amount + r.line_total }),
    { total_supply_price: 0, total_vat_amount: 0, total_amount: 0 }
  )

  // orders 헤더 업데이트
  const updatePayload: Record<string, any> = { ...newTotals }
  if (input.order_date !== undefined) updatePayload.order_date = input.order_date
  if (input.memo      !== undefined)  updatePayload.memo       = input.memo

  const { error: orderErr } = await supabase
    .from('orders').update(updatePayload).eq('id', input.order_id).eq('tenant_id', ctx.tenant_id)
  if (orderErr) return { success: false, error: orderErr.message }

  // order_logs: update
  const { data: afterLines } = await supabase
    .from('order_lines').select('*').eq('order_id', input.order_id)
  await logOrder(supabase, {
    order_id:    input.order_id,
    user_id:     ctx.user_id,
    user_type:   ctx.user_type,
    action:      'update',
    before_data: beforeData,
    after_data:  { lines: afterLines ?? [], ...updatePayload },
  })

  revalidatePath('/orders')
  revalidateTag('customers-balance')
  return { success: true }
}

// ============================================================
// 주문 취소
// ============================================================

export async function cancelOrder(order_id: string, reason?: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: order } = await supabase
    .from('orders').select('id, status, order_number')
    .eq('id', order_id).eq('tenant_id', ctx.tenant_id).is('deleted_at', null).single()
  if (!order)                       return { success: false, error: '주문을 찾을 수 없습니다.' }
  if (order.status === 'cancelled') return { success: false, error: '이미 취소된 주문입니다.' }

  // status만 변경 — 데이터 삭제 금지
  const { error } = await supabase
    .from('orders').update({ status: 'cancelled' })
    .eq('id', order_id).eq('tenant_id', ctx.tenant_id)
  if (error) return { success: false, error: error.message }

  // order_logs: cancel (취소 사유 after_data에 포함)
  await logOrder(supabase, {
    order_id,
    user_id:     ctx.user_id,
    user_type:   ctx.user_type,
    action:      'cancel',
    before_data: { status: order.status },
    after_data:  { status: 'cancelled', reason: reason ?? null },
  })

  revalidatePath('/orders')
  revalidateTag('customers-balance')
  return { success: true }
}

// ============================================================
// 거래처 목록
// ============================================================

export async function getCustomersForOrder(): Promise<ActionResult<CustomerForOrder[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }
  const { data, error } = await supabase
    .from('customers').select('id, name, payment_terms_days')
    .eq('is_buyer', true).is('deleted_at', null).order('name')
  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

// ============================================================
// 상품 목록 (주문용, 거래처 기준 마지막 판매가 포함)
// ============================================================

export async function getProductsForOrder(
  customerId?: string,
): Promise<ActionResult<ProductForOrder[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }
  const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, product_code, name, tax_type, procurement_type,
      product_costs ( cost_price, start_date, end_date ),
      product_prices ( price_type, price ),
      customer_product_prices ( customer_id, last_price )
    `)
    .eq('tenant_id', me.tenant_id).is('deleted_at', null).order('name')
  if (error) return { success: false, error: error.message }

  const today = new Date().toISOString().slice(0, 10)
  return {
    success: true,
    data: (products ?? []).map((p) => {
      const costPrice    = getCurrentCostPrice(p.product_costs ?? [], today)
      const normalPrice  = (p.product_prices ?? []).find((pp: any) => pp.price_type === 'normal')?.price ?? 0
      const customerPrice = customerId
        ? (p.customer_product_prices ?? []).find((cp: any) => cp.customer_id === customerId)?.last_price
        : undefined
      return {
        id: p.id, product_code: p.product_code, name: p.name,
        tax_type: p.tax_type as 'taxable' | 'exempt',
        procurement_type: p.procurement_type,
        fulfillment_type: defaultFulfillment(p.procurement_type),
        current_cost_price: costPrice,
        last_unit_price: customerPrice ?? normalPrice,
      }
    }),
  }
}
