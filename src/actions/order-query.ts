'use server'

import { getCustomersWithBalance } from '@/actions/ledger'

// ============================================================
// RealMyOS - 주문 조회용 Server Actions
// src/actions/order-query.ts
// ============================================================

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface OrderListItem {
  id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  total_amount: number
  status: string
  order_lines: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>
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
  customer_id?: string
}): Promise<ActionResult<OrderListItem[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, total_amount, status, customers(name), order_lines(product_name, quantity, unit_price, line_total)')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.from)        query = query.gte('order_date', filters.from)
  if (filters?.to)          query = query.lte('order_date', filters.to)
  if (filters?.status)      query = query.eq('status', filters.status)
  else                      query = query.in('status', ['draft', 'confirmed', 'cancelled'])
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
      return {
        id:              o.id,
        order_number:    o.order_number,
        order_date:      o.order_date,
        customer_id:     o.customer_id,
        customer_name:   o.customers?.name ?? '-',
        total_amount:    o.total_amount,
        status:          o.status,
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, order_lines(product_id, product_name, product_code, quantity, unit_price, tax_type)')
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
