import type { StorefrontRevenueKPI } from '@/actions/admin/platform-revenue'
import s from '@/app/(admin)/admin-shared.module.css'

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`
}

export default function StorefrontRevenueKpiSection({ data }: { data: StorefrontRevenueKPI }) {
  return (
    <>
      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>Storefront 매출·입금 (PLATFORM-ERP-P1-001)</h2>
          <span className={s.inlineMuted}>
            payments: commerce_order_id·inbound·payee=플랫폼 · 매출은 status=confirmed만 · 날짜는 KST 달력(
            payment_date) — RFQ `orders` KPI는 변경 없음
          </span>
        </div>
        <div className={s.grid4}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>오늘 storefront 매출</div>
            <div className={s.kpiValueMd}>{won(data.today_revenue)}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>이번달 storefront 매출</div>
            <div className={s.kpiValueMd}>{won(data.month_revenue)}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>전체 storefront 매출 누계</div>
            <div className={s.kpiValueMd}>{won(data.total_revenue)}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>미수 (commerce_orders unpaid)</div>
            <div className={s.kpiValueWarn}>{won(data.unpaid_amount)}</div>
          </div>
        </div>
        <div className={s.grid2} style={{ marginTop: 12 }}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>플랫폼 receivable — 확정 storefront 수금 합계</div>
            <div className={s.kpiValueMd}>{won(data.confirmed_payments_total)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              실시간 집계 · DB 저장 없음 (RULE-02)
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>채널 참고 — 전체 합계 (RFQ GMV + storefront 수금)</div>
            <div className={s.cellMutedSm}>오늘 {won(data.combined_today_revenue)}</div>
            <div className={s.cellMutedSm}>이번달 {won(data.combined_month_revenue)}</div>
            <div className={s.kpiValueMd} style={{ marginTop: 8 }}>
              누계 {won(data.combined_total_revenue)}
            </div>
          </div>
        </div>
      </section>

      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>채널별 매출 (참고)</h2>
          <span className={s.inlineMuted}>RFQ는 기존 `orders` 확정·KST 월 경계와 동일 규칙으로 별도 조회</span>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.th}>채널</th>
                <th className={s.th}>오늘</th>
                <th className={s.th}>이번달</th>
                <th className={s.th}>누계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={s.td}>RFQ (`orders` 확정 GMV)</td>
                <td className={s.td}>{won(data.rfq_today_revenue)}</td>
                <td className={s.td}>{won(data.rfq_month_revenue)}</td>
                <td className={s.td}>{won(data.rfq_total_revenue)}</td>
              </tr>
              <tr>
                <td className={s.td}>Storefront (confirmed payments)</td>
                <td className={s.td}>{won(data.today_revenue)}</td>
                <td className={s.td}>{won(data.month_revenue)}</td>
                <td className={s.td}>{won(data.total_revenue)}</td>
              </tr>
              <tr>
                <td className={s.td}>
                  <strong>합계</strong>
                </td>
                <td className={s.td}>
                  <strong>{won(data.combined_today_revenue)}</strong>
                </td>
                <td className={s.td}>
                  <strong>{won(data.combined_month_revenue)}</strong>
                </td>
                <td className={s.td}>
                  <strong>{won(data.combined_total_revenue)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={s.panel} style={{ marginBottom: 16 }}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>최근 storefront payments (10건)</h2>
          <span className={s.inlineMuted}>reversed 제외 · pending·confirmed 표시</span>
        </div>
        {data.recent_payments.length === 0 ? (
          <div className={s.empty}>해당 조건의 payments 가 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['주문번호', '금액', '식당 tenant', '식당명', '결제수단', '입금일', 'status'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((r) => (
                  <tr key={r.payment_id}>
                    <td className={s.tdNowrap}>
                      <div className={s.cellStrong}>{r.order_number ?? '—'}</div>
                      <div className={s.cellMutedSm}>{r.commerce_order_id}</div>
                    </td>
                    <td className={s.td}>{won(r.amount)}</td>
                    <td className={s.td}>
                      <div className={s.cellMutedSm}>{r.tenant_id || '—'}</div>
                    </td>
                    <td className={s.td}>{r.tenant_name ?? '—'}</td>
                    <td className={s.td}>{r.payment_method || '—'}</td>
                    <td className={s.td}>{r.payment_date ?? '—'}</td>
                    <td className={s.td}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
