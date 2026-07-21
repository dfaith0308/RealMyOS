'use server'

import { getCustomersWithBalance } from '@/actions/ledger'

// ============================================================
// RealMyOS - 주문 조회용 Server Actions
// src/actions/order-query.ts
// ============================================================

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { saleAmount } from '@/lib/ledger-calc'
import type { ActionResult, OrderOperationStatus } from '@/types/order'

export interface OrderListItem {
  id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  /** 상품 합계(할인 전) */
  total_amount: number
  discount_amount: number
  point_used: number
  deposit_used: number
  /** 실청구액 = total - discount - point - deposit */
  final_amount: number
  status: string
  order_status: OrderOperationStatus
  order_lines: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number; cost_price?: number | null }>
  current_balance: number | null   // 실시간 잔액 (ledger 기준)
  deposit_amount: number | null    // 예치금
}

export interface LastOrderData {
  customer_id: string
  lines: Array<{
    product_id: string
    product_name: string
    product_code: string
    quantity: number
    unit_price: number
    tax_type: string
  }>
}

// ============================================================
// 주문 목록 (최신순)
// ============================================================

export async function getOrderList(filters?: {
  from?: string
  to?: string
  status?: string
  order_status?: OrderOperationStatus
  customer_id?: string
}): Promise<ActionResult<OrderListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, total_amount, discount_amount, point_used, deposit_used, final_amount, status, order_status, customers(name), order_lines(product_name, quantity, unit_price, line_total, cost_price)')
    // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.from)        query = query.gte('order_date', filters.from)
  if (filters?.to)          query = query.lte('order_date', filters.to)
  if (filters?.status)      query = query.eq('status', filters.status)
  else                      query = query.in('status', ['draft', 'confirmed', 'cancelled'])
  if (filters?.order_status) query = query.eq('order_status', filters.order_status)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)

  const { data, error } = await query

  if (error) return { success: false, error: error.message }

  // customer_id 목록 추출 → batch balance 조회 (N+1 방지)
  const balanceResult = await getCustomersWithBalance()
  const balanceMap = new Map(
    (balanceResult.data ?? []).map((c) => [c.id, c])
  )

  return {
    success: true,
    data: (data ?? []).map((o: any) => {
      const bal = balanceMap.get(o.customer_id)
      const discount_amount = Number(o.discount_amount ?? 0)
      const point_used = Number(o.point_used ?? 0)
      const deposit_used = Number(o.deposit_used ?? 0)
      const total_amount = Number(o.total_amount ?? 0)
      // 목록 표시용 매출액 (deposit 미차감). 필드명 final_amount는 레거시 유지.
      const final_amount = saleAmount({
        total_amount,
        discount_amount,
        point_used,
      })
      return {
        id:              o.id,
        order_number:    o.order_number,
        order_date:      o.order_date,
        customer_id:     o.customer_id,
        customer_name:   o.customers?.name ?? '-',
        total_amount,
        discount_amount,
        point_used,
        deposit_used,
        final_amount,
        status:          o.status,
        order_status:    (o.order_status ?? '접수') as OrderOperationStatus,
        order_lines:     o.order_lines ?? [],
        current_balance: bal?.current_balance ?? null,
        deposit_amount:  bal?.deposit_amount ?? null,
      }
    }),
  }
}

// ============================================================
// 거래처의 마지막 주문 (재주문용)
// ============================================================

export async function getLastOrder(
  customer_id: string,
): Promise<ActionResult<LastOrderData>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, order_lines(product_id, product_name, product_code, quantity, unit_price, tax_type)')
    // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('customer_id', customer_id)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .limit(1)
    .single()

  if (!order) return { success: false, error: '이전 주문 없음' }

  return {
    success: true,
    data: {
      customer_id: order.customer_id,
      lines: (order.order_lines ?? []) as LastOrderData['lines'],
    },
  }
}

// ============================================================
// 주문 단건 라인 조회 (재주문용)
// - OrdersClient의 "재주문 원클릭"에서 order_id로 접근
// - getOrderList는 수정 금지 → 별도 액션으로 분리
// ============================================================

export async function getOrderForReorder(
  order_id: string,
): Promise<ActionResult<LastOrderData>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, customer_id, order_lines(product_id, product_name, product_code, quantity, unit_price, tax_type)')
    // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('id', order_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!order) return { success: false, error: '주문을 찾을 수 없습니다.' }

  return {
    success: true,
    data: {
      customer_id: order.customer_id,
      lines: (order.order_lines ?? []) as LastOrderData['lines'],
    },
  }
}
