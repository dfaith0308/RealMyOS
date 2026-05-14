import Link from 'next/link'
import { getCommerceAllocationsAdminData } from '@/actions/admin/commerce-allocation'
import CommerceAllocationsClient from '@/components/commerce/CommerceAllocationsClient'
import s from '../../../admin-shared.module.css'

type StatusTab = 'all' | 'pending' | 'confirmed' | 'cancelled'

function parseStatus(raw: string | string[] | undefined): StatusTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'pending' || v === 'confirmed' || v === 'cancelled' || v === 'all') return v
  return 'all'
}

export default async function AdminCommerceAllocationsPage(props: { searchParams?: Promise<{ status?: string | string[] }> }) {
  const sp = (await props.searchParams) ?? {}
  const status = parseStatus(sp.status)
  const res = await getCommerceAllocationsAdminData(status)

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>공급자 지급 예정 (allocation)</h1>
          <p className={s.subtitleMax780}>
            paid storefront 주문 품목별 payable 스냅샷입니다. 정산 자동화·실지급 없음 — 관리자만 확정할 수 있습니다.
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/commerce/orders" className={s.ghostBtn}>
            주문 처리
          </Link>
        </div>
      </header>

      {!res.success || !res.data ? (
        <div className={s.alert}>{res.error ?? '데이터를 불러오지 못했습니다.'}</div>
      ) : (
        <CommerceAllocationsClient status={status} summaries={res.data.summaries} rows={res.data.rows} />
      )}
    </main>
  )
}
