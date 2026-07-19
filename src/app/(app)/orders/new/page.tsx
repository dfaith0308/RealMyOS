import { getLastOrder, getOrderForReorder } from '@/actions/order-query'
import { getQuoteDetail } from '@/actions/quote'
import OrderCreateForm from '@/components/order/OrderCreateForm'

export const metadata = { title: '주문 등록 — RealMyOS' }

export default async function OrderNewPage({
  searchParams,
}: {
  searchParams: { customer_id?: string; quote_id?: string; conv?: string; reorder?: string; product_id?: string }
}) {
  const { customer_id, quote_id, conv, reorder, product_id } = searchParams

  let initialCustomerId: string | undefined
  let reorderLines: Array<{
    product_id: string; product_name: string; product_code: string
    quantity: number; unit_price: number
  }> | undefined
  let quoteContext: { quote_id: string; conversions: Array<{ item_id: string; qty: number }> } | undefined

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

  // 주문 목록에서 "재주문" (order_id 기반)
  if (reorder) {
    const res = await getOrderForReorder(reorder)
    if (res.success && res.data) {
      initialCustomerId = res.data.customer_id
      reorderLines = res.data.lines
    }
  }

  if (quote_id && conv) {
    const parsed: Array<{ item_id: string; qty: number }> = (() => {
      try {
        const x = JSON.parse(conv)
        return Array.isArray(x) ? x : []
      } catch {
        return []
      }
    })()

    const detail = await getQuoteDetail(quote_id)
    if (detail.success && detail.data) {
      initialCustomerId = detail.data.customer_id
      quoteContext = { quote_id, conversions: parsed }

      const byItemId = new Map(parsed.map((c) => [c.item_id, c.qty]))
      reorderLines = detail.data.items.flatMap((it) => {
        const qty = byItemId.get(it.id)
        if (!qty || qty <= 0) return []
        if (!it.product_id) return []
        return [{
          product_id: it.product_id,
          product_name: it.product_name,
          product_code: it.product_code,
          quantity: qty,
          unit_price: it.quoted_price,
          tax_type: it.tax_type,
        } as any]
      })
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface-0)', paddingTop: 32 }}>
      <OrderCreateForm
        initialCustomerId={initialCustomerId}
        initialProductId={product_id}
        reorderLines={reorderLines}
        quoteContext={quoteContext}
      />
    </main>
  )
}
