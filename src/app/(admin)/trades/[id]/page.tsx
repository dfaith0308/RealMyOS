import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTradeTimeline } from '@/actions/admin/trade-monitor'
import s from '../../admin-shared.module.css'

export const metadata = { title: '거래 상세 — RealMyOS' }

function fmtIso(iso: string | null) {
  if (!iso) return '미완료'
  return String(iso).slice(0, 16).replace('T', ' ')
}

function fmtDuration(hours: number | null) {
  if (hours == null) return '—'
  if (hours < 48) return `${hours}h`
  const d = Math.floor(hours / 24)
  const h = hours % 24
  return h ? `${d}d ${h}h` : `${d}d`
}

export default async function AdminTradeDetailPage({ params }: { params: { id: string } }) {
  const id = params.id
  if (!id) notFound()

  const res = await getTradeTimeline(id)
  if (!res.success || !res.data) notFound()

  const { resolved, thresholds, timeline, hints } = res.data

  const title =
    resolved.kind === 'order'
      ? `거래 상세 (order:${resolved.order_id?.slice(0, 8)}…)`
      : resolved.kind === 'rfq'
        ? `거래 상세 (rfq:${resolved.rfq_id?.slice(0, 8)}…)`
        : resolved.kind === 'payment'
          ? `거래 상세 (payment:${resolved.payment_id?.slice(0, 8)}…)`
          : '거래 상세'

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>{title}</h1>
          <p className={s.subtitle}>
            RFQ → 입찰 → 낙찰 → 주문 → 출고/납품 → 정산 타임라인 (PRODUCT §10-4)
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/trades" className={s.ghostBtn}>
            목록으로
          </Link>
          <Link href="/admin/dashboard" className={s.ghostBtn}>
            대시보드
          </Link>
        </div>
      </header>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>기준값 (admin_settings)</h2>
        </div>
        <div className={s.grid2}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>rfq_open_duration_hours</div>
            <div className={s.kpiValue}>{thresholds.rfq_open_duration_hours}h</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>delivery_signal_window</div>
            <div className={s.kpiValue}>{thresholds.delivery_signal_window}d</div>
          </div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>거래 수명 타임라인</h2>
          <div className={s.inlineMuted}>입력 id: {id}</div>
        </div>

        {timeline.length === 0 ? (
          <div className={s.empty}>표시할 타임라인 데이터가 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['단계', '완료 일시', '체류(이전→현재)', '상태', '비고'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeline.map((t) => (
                  <tr key={t.step}>
                    <td className={s.tdNowrap}>
                      <div className={s.cellStrong}>{t.label}</div>
                      <div className={s.cellMutedSm}>{t.step}</div>
                    </td>
                    <td className={s.tdNowrap}>{fmtIso(t.completed_at)}</td>
                    <td className={s.tdNowrap}>{fmtDuration(t.duration_hours)}</td>
                    <td className={s.tdNowrap}>
                      {t.is_anomaly ? <span className={s.badgeHigh}>이상</span> : <span className={s.badgeNormal}>정상</span>}
                    </td>
                    <td className={s.tdWide}>
                      <div className={s.cellMutedSm}>{t.note ?? ''}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hints.length ? (
        <section className={s.panel}>
          <div className={s.panelHeader}>
            <h2 className={s.panelTitle}>주의 / 힌트</h2>
          </div>
          <div className={s.empty} style={{ textAlign: 'left' }}>
            {hints.map((h, i) => (
              <div key={`${i}-${h}`} style={{ marginTop: i ? 6 : 0 }}>
                - {h}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

