import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getSettings } from '@/actions/settings'
import { getProducts } from '@/actions/product'
import OrderEditForm from '@/components/order/OrderEditForm'

export const metadata = { title: '주문 수정 — RealMyOS' }

export default async function OrderEditPage({
  params,
}: {
  params: { id: string }
}) {
  const { id } = params
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [{ data: order }, settingsResult, productsResult] = await Promise.all([
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
      // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .is('deleted_at', null)
      .single(),
    getSettings(),
    getProducts(),
  ])

  if (!order) notFound()

  const lockDays = settingsResult.success && settingsResult.data
    ? settingsResult.data.order_edit_lock_days
    : 7

  const diffDays = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 86400000
  )
  const isLocked = diffDays > lockDays || order.status === 'cancelled'

  // OrderEditForm에서 필요한 필드만 추출
  const products = (productsResult.data ?? []).map(p => ({
    id:            p.id,
    product_code:  p.product_code,
    name:          p.name,
    tax_type:      p.tax_type,
    cost_price:    p.cost_price,
    selling_price: p.selling_price ?? null,
  }))

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <OrderEditForm
        order={order as any}
        isLocked={isLocked}
        lockDays={lockDays}
        diffDays={diffDays}
        products={products}
      />
    </main>
  )
}