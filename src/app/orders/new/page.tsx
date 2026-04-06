import OrderCreateForm from '@/components/order/OrderCreateForm'

export const metadata = { title: '주문 등록 — RealMyOS' }

export default function OrderNewPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <OrderCreateForm />
    </main>
  )
}
