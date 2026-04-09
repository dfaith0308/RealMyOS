import { Suspense } from 'react'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getOrderList } from '@/actions/order-query'
import { formatKRW } from '@/lib/calc'
import OrdersClient from '@/components/order/OrdersClient'

export const metadata = { title: '주문 목록 — RealMyOS' }

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { customer_id?: string; from?: string; to?: string; status?: string }
}) {
  const sp = searchParams

  // 기본 조회: 이번 달 1일 ~ 오늘
  const today     = new Date().toISOString().slice(0, 10)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const from   = sp.from   ?? monthStart
  const to     = sp.to     ?? today
  const status = sp.status ?? ''
  const customerId = sp.customer_id ?? ''


  const _t0 = Date.now()
  const [ordersResult, { data: customers }] = await Promise.all([
    getOrderList({ from, to, status: status || undefined, customer_id: customerId || undefined }),
    createSupabaseServer().then((s) =>
      s.from('customers').select('id, name').eq('is_buyer', true).is('deleted_at', null).order('name')
    ),
  ])

  console.log(`[PERF] /orders: ${Date.now() - _t0}ms`)

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <OrdersClient
        orders={ordersResult.data ?? []}
        customers={customers ?? []}
        filters={{ from, to, status, customer_id: customerId }}
      />
    </main>
  )
}
