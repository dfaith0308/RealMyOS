'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import { calcLine, calcOrderTotals, formatOrderNumber } from '@/lib/calc'
import type {
  CreateOrderInput,
  ActionResult,
  CreatedOrder,
  CustomerForOrder,
  ProductForOrder,
} from '@/types/order'

// ============================================================
// 주문 생성
// ============================================================

export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<CreatedOrder>> {
  const supabase = await createSupabaseServer()

  // 1. 인증
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: '로그인이 필요합니다.' }

  // 2. tenant_id 조회
  const { data: me } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 정보를 불러올 수 없습니다.' }
  const tenant_id = me.tenant_id

  // 3. 기본 검증
  if (!input.customer_id) return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.lines?.length) return { success: false, error: '상품을 1개 이상 추가해주세요.' }

  // 4. 거래처 검증 (RLS + 명시적 tenant 격리)
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', input.customer_id)
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처입니다.' }

  // 5. 상품 일괄 조회 (스냅샷 + 현재 매입가)
  const productIds = [...new Set(input.lines.map((l) => l.product_id))]
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select(`
      id, product_code, name, tax_type, procurement_type,
      product_costs ( cost_price, start_date, end_date )
    `)
    .in('id', productIds)
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null)
  if (prodErr || !products || products.length !== productIds.length) {
    return { success: false, error: '상품 정보 조회 실패.' }
  }

  const productMap = new Map(products.map((p) => [p.id, p]))
  const orderDate = input.order_date || new Date().toISOString().slice(0, 10)

  // 6. 라인별 계산 (서버에서 cost_price 확정 - 클라이언트 값 무시)
  const lineRows = input.lines.map((line) => {
    const product = productMap.get(line.product_id)!
    const cost_price = getCurrentCostPrice(product.product_costs ?? [], orderDate)
    const tax_type = product.tax_type as 'taxable' | 'exempt'
    const calc = calcLine(line.unit_price, line.quantity, tax_type)
    return {
      product_id: line.product_id,
      product_code: product.product_code,           // 스냅샷
      product_name: product.name,                   // 스냅샷
      unit_price: line.unit_price,                  // 스냅샷
      cost_price,                                   // 스냅샷 (서버 확정값)
      fulfillment_type: line.fulfillment_type ?? defaultFulfillment(product.procurement_type),
      quantity: line.quantity,
      supply_price: calc.supply_price,
      vat_amount: calc.vat_amount,
      line_total: calc.line_total,
    }
  })

  // 7. 합계
  const totals = calcOrderTotals(lineRows)

  // 8. 주문번호 채번
  const orderNumber = await issueOrderNumber(supabase, tenant_id, orderDate)

  // 9. orders INSERT
  const { data: newOrder, error: orderErr } = await supabase
    .from('orders')
    .insert({
      tenant_id,
      customer_id: input.customer_id,
      order_number: orderNumber,
      order_date: orderDate,
      status: input.status ?? 'confirmed',
      total_supply_price: totals.total_supply_price,
      total_vat_amount: totals.total_vat_amount,
      total_amount: totals.total_amount,
      memo: input.memo ?? null,
      created_by: user.id,
    })
    .select('id, order_number, total_amount')
    .single()
  if (orderErr || !newOrder) return { success: false, error: `주문 생성 실패: ${orderErr?.message}` }

  // 10. order_lines INSERT
  const { error: linesErr } = await supabase
    .from('order_lines')
    .insert(lineRows.map((r) => ({ order_id: newOrder.id, ...r })))
  if (linesErr) {
    // 롤백: order cancelled 처리
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', newOrder.id)
    return { success: false, error: `라인 저장 실패: ${linesErr.message}` }
  }

  // 11. 거래처별 마지막 판매가 캐시 갱신 (실패해도 주문은 완료)
  const cacheRows = lineRows.map((r) => ({
    customer_id: input.customer_id,
    product_id: r.product_id,
    last_price: r.unit_price,
    updated_at: new Date().toISOString(),
  }))
  await supabase
    .from('customer_product_prices')
    .upsert(cacheRows, { onConflict: 'customer_id,product_id' })

  revalidatePath('/orders')

  return {
    success: true,
    data: {
      order_id: newOrder.id,
      order_number: newOrder.order_number,
      total_amount: newOrder.total_amount,
    },
  }
}

// ============================================================
// 거래처 목록 조회
// ============================================================

export async function getCustomersForOrder(): Promise<ActionResult<CustomerForOrder[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, payment_terms_days')
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('name')
  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

// ============================================================
// 상품 목록 조회 (거래처 기준 마지막 판매가 포함)
// ============================================================

export async function getProductsForOrder(
  customerId?: string,
): Promise<ActionResult<ProductForOrder[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, product_code, name, tax_type, procurement_type,
      product_costs ( cost_price, start_date, end_date ),
      product_prices ( price_type, price ),
      customer_product_prices ( customer_id, last_price )
    `)
    .eq('tenant_id', me.tenant_id)
    .is('deleted_at', null)
    .order('name')
  if (error) return { success: false, error: error.message }

  const today = new Date().toISOString().slice(0, 10)

  const result: ProductForOrder[] = (products ?? []).map((p) => {
    const costPrice = getCurrentCostPrice(p.product_costs ?? [], today)
    const normalPrice = (p.product_prices ?? []).find((pp: { price_type: string; price: number }) => pp.price_type === 'normal')?.price ?? 0
    const customerPrice = customerId
      ? (p.customer_product_prices ?? []).find((cp: { customer_id: string; last_price: number }) => cp.customer_id === customerId)?.last_price
      : undefined
    return {
      id: p.id,
      product_code: p.product_code,
      name: p.name,
      tax_type: p.tax_type as 'taxable' | 'exempt',
      procurement_type: p.procurement_type,
      fulfillment_type: defaultFulfillment(p.procurement_type),
      current_cost_price: costPrice,
      last_unit_price: customerPrice ?? normalPrice,
    }
  })

  return { success: true, data: result }
}

// ============================================================
// 헬퍼
// ============================================================

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
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  tenant_id: string,
  dateStr: string,
): Promise<string> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('order_date', dateStr)
  return formatOrderNumber(new Date(dateStr), (count ?? 0) + 1)
}
