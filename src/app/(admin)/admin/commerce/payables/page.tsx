import Link from 'next/link'
import { getSupplierPayablesAdminData } from '@/actions/admin/supplier-payables'
import CommercePayablesClient from '@/components/commerce/CommercePayablesClient'
import s from '../../../admin-shared.module.css'

type StatusTab = 'all' | 'unpaid' | 'paid' | 'cancelled'

function parseStatus(raw: string | string[] | undefined): StatusTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v === 'unpaid' || v === 'paid' || v === 'cancelled' || v === 'all') return v
  return 'all'
}

export default async function AdminCommercePayablesPage(props: { searchParams?: Promise<{ status?: string | string[] }> }) {
  const sp = (await props.searchParams) ?? {}
  const status = parseStatus(sp.status)
  const res = await getSupplierPayablesAdminData(status)

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>공급자 지급 예정 원장</h1>
          <p className={s.subtitleMax780}>
            확정된 allocation과 1:1로 연결된 <code>supplier_payables</code> 입니다. 미지급 행은 관리자가 지급 완료 처리 시 paid로 전환되며 append-only <code>payments</code> outbound(payout) 이벤트가 생성됩니다.
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/commerce/allocations" className={s.ghostBtn}>
            Allocation
          </Link>
          <Link href="/admin/commerce/orders" className={s.ghostBtn}>
            주문 처리
          </Link>
        </div>
      </header>

      {!res.success || !res.data ? (
        <div className={s.alert}>{res.error ?? '데이터를 불러오지 못했습니다.'}</div>
      ) : (
        <CommercePayablesClient status={status} payload={res.data} />
      )}
    </main>
  )
}
