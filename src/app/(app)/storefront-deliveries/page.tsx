import { getSupplierDeliveryOrders } from '@/actions/storefront-delivery'
import SupplierDeliveriesClient from './SupplierDeliveriesClient'

export const metadata = { title: '스토어 주문 배송 — RealMyOS' }

export default async function StorefrontDeliveriesPage() {
  const res = await getSupplierDeliveryOrders()

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>스토어 주문 배송</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0', lineHeight: 1.6 }}>
          식식이 스토어에서 들어와 우리에게 배정된 주문입니다. 출고·배송 단계를 눌러 기록하면 식당 화면의 배송
          타임라인에 그대로 보입니다. 여러 공급자가 함께 보내는 주문은 관리자가 입력합니다.
        </p>
      </div>

      {!res.success ? (
        <p style={{ fontSize: 13, color: '#b91c1c' }}>{res.error ?? '주문을 불러오지 못했습니다.'}</p>
      ) : (
        <SupplierDeliveriesClient orders={res.data?.orders ?? []} />
      )}
    </main>
  )
}
