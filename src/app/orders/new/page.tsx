import { getCustomersForOrder } from '@/actions/order'
import { getLastOrder } from '@/actions/order-query'
import OrderCreateForm from '@/components/order/OrderCreateForm'

export const metadata = { title: '주문 등록 — RealMyOS' }

export default async function OrderNewPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string }>
}) {
  const { customer_id } = await searchParams

  let initialCustomerId: string | undefined
  let reorderLines: Array<{
    product_id: string; product_name: string; product_code: string
    quantity: number; unit_price: number
  }> | undefined

  if (customer_id) {
    // 주문 목록에서 재주문: "reorder_{customer_id}" 형식
    // customers 페이지에서 주문: 일반 customer_id
    const rawId = customer_id.startsWith('reorder_')
      ? customer_id.replace('reorder_', '')
      : customer_id

    initialCustomerId = rawId

    // 재주문인 경우 마지막 주문 라인 복제
    if (customer_id.startsWith('reorder_')) {
      const result = await getLastOrder(rawId)
      if (result.success && result.data) {
        reorderLines = result.data.lines
      }
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <OrderCreateForm
        initialCustomerId={initialCustomerId}
        reorderLines={reorderLines}
      />
    </main>
  )
}
