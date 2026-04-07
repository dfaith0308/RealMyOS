'use server'

// ============================================================
// RealMyOS - 주문 조회용 Server Actions
// src/actions/order-query.ts
// ============================================================

import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface OrderListItem {
  id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  total_amount: number
  status: string
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

export async function getOrderList(): Promise<ActionResult<OrderListItem[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, total_amount, status, customers(name)')
    .is('deleted_at', null)
    .in('status', ['draft', 'confirmed', 'cancelled'])
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((o: any) => ({
      id:            o.id,
      order_number:  o.order_number,
      order_date:    o.order_date,
      customer_id:   o.customer_id,
      customer_name: o.customers?.name ?? '-',
      total_amount:  o.total_amount,
      status:        o.status,
    })),
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