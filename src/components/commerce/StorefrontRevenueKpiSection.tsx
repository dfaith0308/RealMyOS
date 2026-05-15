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
          <h2 className={s.panelTitle}>Storefront 매출·입금 (KPI-REVERSAL-P0-001)</h2>
          <span className={s.inlineMuted}>
            순매출(net) = 원본 입금 합(gross, confirmed·reversal 없음) − reversal 행 합(`reversal_of_id` 기준, amount는 DB에 양수).
            KST `payment_date` · RFQ `orders` KPI는 변경 없음 · RULE-02 실시간만
          </span>
        </div>
        <div className={s.grid4}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>오늘 storefront 순매출(net)</div>
            <div className={s.kpiValueMd}>{won(data.today_revenue)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              gross {won(data.today_gross_revenue)} − reversal {won(data.today_reversal_amount)}
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>이번달 storefront 순매출(net)</div>
            <div className={s.kpiValueMd}>{won(data.month_revenue)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              gross {won(data.month_gross_revenue)} − reversal {won(data.month_reversal_amount)}
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>전체 storefront 순매출 누계(net)</div>
            <div className={s.kpiValueMd}>{won(data.total_revenue)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              gross {won(data.total_gross_revenue)} − reversal {won(data.total_reversal_amount)}
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>미수 (commerce_orders unpaid)</div>
            <div className={s.kpiValueWarn}>{won(data.unpaid_amount)}</div>
          </div>
        </div>
        <div className={s.grid2} style={{ marginTop: 12 }}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>오늘 취소·역처리(reversal) 금액</div>
            <div className={s.kpiValueMd} style={{ color: 'var(--ds-text-warning, #b45309)' }}>
              {won(data.today_reversal_amount)}
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>이번달 취소·역처리(reversal) 금액</div>
            <div className={s.kpiValueMd} style={{ color: 'var(--ds-text-warning, #b45309)' }}>
              {won(data.month_reversal_amount)}
            </div>
          </div>
        </div>
        <div className={s.grid3} style={{ marginTop: 12 }}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>공급자 미지급</div>
            <div className={s.kpiValueWarn}>{won(data.supplier_payable_unpaid)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              supplier_payables · unpaid · cancelled 제외
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>공급자 지급완료</div>
            <div className={s.kpiValueMd}>{won(data.supplier_payable_paid)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              supplier_payables · paid · 누적 지급 원장
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>플랫폼 마진(운영 KPI)</div>
            <div className={s.kpiValueMd}>{won(data.platform_margin)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              순누계 {won(data.total_revenue)} − 미지급 {won(data.supplier_payable_unpaid)} − 지급완료{' '}
              {won(data.supplier_payable_paid)}
            </div>
          </div>
        </div>
        <div className={s.grid2} style={{ marginTop: 12 }}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>플랫폼 receivable — storefront 순누계</div>
            <div className={s.kpiValueMd}>{won(data.confirmed_payments_total)}</div>
            <div className={s.cellMutedSm} style={{ marginTop: 6 }}>
              reversal row 건수(조회 상한 내) {data.reversal_count.toLocaleString('ko-KR')}건 · DB 저장 없음 (RULE-02)
            </div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>채널 참고 — 전체 합계 (RFQ GMV + storefront 순매출)</div>
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
                <td className={s.td}>Storefront (순매출 net)</td>
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
          <span className={s.inlineMuted}>입금(원본 confirmed) / reversal 행 구분</span>
        </div>
        {data.recent_payments.length === 0 ? (
          <div className={s.empty}>해당 조건의 payments 가 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['구분', '주문번호', '금액', '식당 tenant', '식당명', '결제수단', '입금일', 'status', 'reversal_of_id', '사유'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent_payments.map((r) => (
                  <tr key={r.payment_id}>
                    <td className={s.td}>
                      {r.is_reversal ? (
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(185, 28, 28, 0.12)',
                            color: 'var(--ds-text-danger, #b91c1c)',
                          }}
                        >
                          reversal
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(22, 163, 74, 0.12)',
                            color: 'var(--ds-text-success, #15803d)',
                          }}
                        >
                          입금
                        </span>
                      )}
                    </td>
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
                    <td className={s.tdNowrap}>
                      <div className={s.cellMutedSm}>{r.reversal_of_id ?? '—'}</div>
                    </td>
                    <td className={s.td}>
                      <div className={s.cellMutedSm}>{r.reversal_reason ?? '—'}</div>
                    </td>
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
