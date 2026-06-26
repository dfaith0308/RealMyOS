import { getCoupons } from '@/actions/admin/coupons'
import CouponsClient from '@/components/admin/CouponsClient'

export default async function CouponsPage() {
  const res = await getCoupons()
  const coupons = res.success ? res.data?.coupons ?? [] : []
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
      <CouponsClient coupons={coupons} loadError={res.success ? null : res.error ?? '조회 실패'} />
    </main>
  )
}
