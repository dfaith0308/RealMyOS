import Link from 'next/link'
import CommercePricingPoliciesClient from '@/components/commerce/CommercePricingPoliciesClient'
import { getPricingPolicyFormOptions, listPricingPoliciesAdmin } from '@/actions/admin/pricing-policies'
import s from '../../../admin-shared.module.css'

export default async function AdminCommercePricingPage() {
  const [listRes, optRes] = await Promise.all([listPricingPoliciesAdmin(), getPricingPolicyFormOptions()])

  const rows = listRes.success && listRes.data ? listRes.data.rows : []
  const restaurants = optRes.success && optRes.data ? optRes.data.restaurants : []
  const listings = optRes.success && optRes.data ? optRes.data.listings : []
  const loadErr =
    !listRes.success ? listRes.error : !optRes.success ? optRes.error : null

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>가격 정책 (P0)</h1>
          <p className={s.subtitleMax780}>
            storefront 주문 시 적용되는 정책을 등록합니다. 식당 앱은 정책 테이블을 직접 조회하지 않으며, 주문 품목에 스냅샷만 남습니다.
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/commerce/orders" className={s.ghostBtn}>
            주문 처리
          </Link>
        </div>
      </header>

      {loadErr ? <div className={s.alert}>{loadErr}</div> : null}

      <CommercePricingPoliciesClient initialRows={rows} restaurants={restaurants} listings={listings} />
    </main>
  )
}
