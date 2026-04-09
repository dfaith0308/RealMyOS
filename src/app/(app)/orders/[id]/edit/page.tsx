import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import OrderEditForm from '@/components/order/OrderEditForm'

export const metadata = { title: '주문 수정 — RealMyOS' }

export default async function OrderEditPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const supabase = await createSupabaseServer()

  const [{ data: order }, settingsResult] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, order_number, order_date, status, memo, created_at,
        total_supply_price, total_vat_amount, total_amount,
        customers ( id, name ),
        order_lines (
          id, product_id, product_code, product_name,
          unit_price, cost_price, tax_type, fulfillment_type,
          quantity, supply_price, vat_amount, line_total
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    getSettings(),
  ])

  if (!order) notFound()

  const lockDays = settingsResult.success && settingsResult.data
    ? settingsResult.data.order_edit_lock_days
    : DEFAULT_SETTINGS.order_edit_lock_days

  const diffDays = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 86400000
  )
  const isLocked = diffDays > lockDays || order.status === 'cancelled'

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <OrderEditForm
        order={order as any}
        isLocked={isLocked}
        lockDays={lockDays}
        diffDays={diffDays}
      />
    </main>
  )
}
