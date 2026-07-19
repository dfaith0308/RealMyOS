import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getOrderList } from '@/actions/order-query'
import OrdersClient from '@/components/order/OrdersClient'
import { ORDER_OPERATION_STATUS_LIST, type OrderOperationStatus } from '@/types/order'
import styles from './orders-ops.module.css'

export const metadata = { title: '주문 목록 — RealMyOS' }

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: {
    customer_id?: string
    from?: string
    to?: string
    status?: string
    order_status?: string
    view?: string
    period?: string
  }
}) {
  const sp = searchParams

  const nowKst = new Date(Date.now() + 9 * 3600000)
  const today = nowKst.toISOString().slice(0, 10)
  const monthStart = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}-01`

  const periodAll = sp.period === 'all' && !sp.from && !sp.to
  const periodRange = sp.period === 'range'
  const from = periodAll ? '' : (sp.from ?? monthStart)
  const to = periodAll ? '' : (sp.to ?? today)
  const status = sp.status ?? ''
  const order_status = sp.order_status ?? ''
  const customerId = sp.customer_id ?? ''
  const view = sp.view ?? ''
  const period = periodAll ? 'all' : periodRange ? 'range' : (sp.period ?? '')

  const opStatus: OrderOperationStatus | undefined =
    order_status && (ORDER_OPERATION_STATUS_LIST as readonly string[]).includes(order_status)
      ? (order_status as OrderOperationStatus)
      : undefined

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [ordersResult, { data: customers }] = await Promise.all([
    getOrderList({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      status: status || undefined,
      order_status: opStatus,
      customer_id: customerId || undefined,
    }),
    supabase
      .from('customers')
      .select('id, name, representative_name, phone')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_buyer', true)
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <main className={styles.page}>
      <OrdersClient
        orders={ordersResult.data ?? []}
        customers={customers ?? []}
        filters={{
          from,
          to,
          status,
          order_status: opStatus ?? '',
          customer_id: customerId,
          view,
          period,
        }}
      />
    </main>
  )
}
