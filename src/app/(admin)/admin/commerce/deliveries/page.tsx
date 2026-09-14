import Link from 'next/link'
import { getDeliveryBoard } from '@/actions/admin/commerce-delivery'
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABEL, isDeliveryStatus } from '@/lib/delivery-tracking/status'
import s from '../../../admin-shared.module.css'
import DeliveryBoardClient from './DeliveryBoardClient'

export const metadata = { title: '배송 현황 — 식식이 관리자' }

function one(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v
  return (raw ?? '').trim()
}

export default async function AdminDeliveryBoardPage(props: {
  searchParams?: Promise<{ filter?: string | string[] }>
}) {
  const sp = (await props.searchParams) ?? {}
  const rawFilter = one(sp.filter)
  const filter =
    rawFilter === 'all' || rawFilter === 'untracked' || rawFilter === 'open' || isDeliveryStatus(rawFilter)
      ? rawFilter
      : 'open'

  const res = await getDeliveryBoard(filter)
  const board = res.success ? res.data : undefined

  const tabs: [string, string][] = [
    ['open', '미완료 전체'],
    ['untracked', '추적 시작 전'],
    ...DELIVERY_STATUSES.map((st) => [st, DELIVERY_STATUS_LABEL[st]] as [string, string]),
    ['all', '전체'],
  ]

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>배송 현황</h1>
          <p className={s.subtitleMax720}>
            결제 확인 이후 storefront 주문의 배송 상태입니다. 택배 조회 업체가 연결되기 전까지는 관리자·공급자가
            직접 입력한 값으로 채워집니다. 주문 결제 상태(주문처리 화면)와는 따로 움직입니다.
          </p>
        </div>
      </header>

      {!board ? (
        <p className={s.errText}>{res.error ?? '배송 현황을 불러오지 못했습니다.'}</p>
      ) : (
        <>
          <section className={s.kpiCard}>
            <h2 className={s.kpiTitle}>상태별 건수 (최근 1,000건 기준)</h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.8 }}>
              {DELIVERY_STATUSES.map((st) => (
                <span key={st} style={{ marginRight: 14, whiteSpace: 'nowrap' }}>
                  {DELIVERY_STATUS_LABEL[st]}{' '}
                  <strong style={{ color: st === 'attention' || st === 'lookup_error' ? '#b91c1c' : undefined }}>
                    {board.counts[st]}
                  </strong>
                </span>
              ))}
              <span style={{ whiteSpace: 'nowrap', color: 'var(--ds-text-secondary)' }}>
                추적 시작 전 <strong>{board.untracked}</strong>
              </span>
            </p>
          </section>

          <nav className={s.actionsRow} style={{ flexWrap: 'wrap', margin: '16px 0 8px' }}>
            {tabs.map(([key, label]) => (
              <Link
                key={key}
                href={`/admin/commerce/deliveries?filter=${key}`}
                className={filter === key ? s.primaryBtn : s.ghostBtn}
                style={{ textDecoration: 'none' }}
              >
                {label}
              </Link>
            ))}
          </nav>

          <DeliveryBoardClient rows={board.rows} />
        </>
      )}
    </main>
  )
}
