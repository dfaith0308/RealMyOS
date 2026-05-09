import Link from 'next/link'
import { getCommerceOrders } from '@/actions/admin/commerce'
import OrdersClient from '@/components/commerce/OrdersClient'
import s from '../../../admin-shared.module.css'

type StatusFilter = 'all' | 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'completed' | 'cancelled' | 'refunded'
type PaymentFilter = 'all' | 'card' | 'bank_transfer' | 'kakao_manual'

export default async function AdminCommerceOrdersPage(props: {
  searchParams?: Promise<{ status?: string | string[]; payment?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const rawSt = Array.isArray(searchParams?.status) ? searchParams?.status?.[0] : searchParams?.status
  const rawPm = Array.isArray(searchParams?.payment) ? searchParams?.payment?.[0] : searchParams?.payment

  const statusFilter: StatusFilter =
    rawSt === 'pending_payment' ||
    rawSt === 'paid' ||
    rawSt === 'preparing' ||
    rawSt === 'shipped' ||
    rawSt === 'completed' ||
    rawSt === 'cancelled' ||
    rawSt === 'refunded' ||
    rawSt === 'all'
      ? rawSt
      : 'all'

  const paymentFilter: PaymentFilter =
    rawPm === 'card' || rawPm === 'bank_transfer' || rawPm === 'kakao_manual' || rawPm === 'all'
      ? rawPm
      : 'all'

  const res = await getCommerceOrders({
    status: statusFilter === 'all' ? undefined : statusFilter,
    payment_method: paymentFilter === 'all' ? undefined : paymentFilter,
  })

  if (!res.success) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>주문 처리</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {res.error}
        </p>
      </main>
    )
  }

  const manualReviewQueue = res.data?.manualReviewQueue ?? []
  const orders = res.data?.orders ?? []

  const filterNav = (
    <>
      <nav className={s.actionsRow} style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)', marginRight: 4 }}>상태</span>
        {(
          [
            ['all', '전체'],
            ['pending_payment', '결제대기'],
            ['paid', '결제완료'],
            ['preparing', '준비중'],
            ['shipped', '배송중'],
            ['completed', '완료'],
            ['cancelled', '취소'],
            ['refunded', '환불'],
          ] as const
        ).map(([key, label]) => (
          <FilterTab
            key={key}
            href={filterHref({ status: key, payment: paymentFilter })}
            active={statusFilter === key}
            label={label}
          />
        ))}
      </nav>
      <nav className={s.actionsRow} style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)', marginRight: 4 }}>결제</span>
        {(
          [
            ['all', '전체'],
            ['card', '카드'],
            ['bank_transfer', '무통장'],
            ['kakao_manual', '카카오'],
          ] as const
        ).map(([key, label]) => (
          <FilterTab
            key={key}
            href={filterHref({ status: statusFilter, payment: key })}
            active={paymentFilter === key}
            label={label}
          />
        ))}
      </nav>
    </>
  )

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>주문 처리</h1>
          <p className={s.subtitle}>무통장·카카오 수동 확인 및 배송 상태 관리 (COMMERCE-FLOW 준수)</p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/commerce/products" className={s.ghostBtn}>
            상품 관리
          </Link>
          <Link href="/admin/dashboard" className={s.ghostBtn}>
            대시보드
          </Link>
        </div>
      </header>

      <OrdersClient manualReviewQueue={manualReviewQueue} orders={orders} filterNav={filterNav} />
    </main>
  )
}

function filterHref(parts: { status: string; payment: string }) {
  const q = new URLSearchParams()
  if (parts.status !== 'all') q.set('status', parts.status)
  if (parts.payment !== 'all') q.set('payment', parts.payment)
  const qs = q.toString()
  return qs ? `/admin/commerce/orders?${qs}` : '/admin/commerce/orders'
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={active ? s.primaryBtn : s.ghostBtn}
      style={{ fontSize: 12, padding: '6px 12px' }}
    >
      {label}
    </Link>
  )
}
