import Link from 'next/link'
import { getPendingSettlements, getPlatformRevenue, getSettlementHistory, getUnifiedSettlementView } from '@/actions/admin/settlement-control'
import SettleOrderButton from './SettleOrderButton'
import s from '../admin-shared.module.css'

export default async function AdminSettlementsPage() {
  const [rev, pend, unified, hist] = await Promise.all([
    getPlatformRevenue(),
    getPendingSettlements(),
    getUnifiedSettlementView(),
    getSettlementHistory(),
  ])

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>수익/정산 통제</h1>
          <p className={s.subtitleMax780}>
            PRODUCT §10-9 — 정산은 관리자 확인 버튼 이후에만 기록됩니다. 수수료율은{' '}
            <code className={s.code}>admin_settings</code> 에서만 조회합니다.
          </p>
        </div>
        <Link href="/admin/growth" className={s.ghostBtnMd}>
          성장 엔진
        </Link>
      </header>

      {!rev.success || !rev.data ? (
        <div className={s.alert}>{rev.error ?? '수익 현황을 불러오지 못했습니다.'}</div>
      ) : (
        <section className={s.grid4}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>이번달 GMV (확정)</div>
            <div className={s.kpiValueMd}>{rev.data.month_gmv.toLocaleString()}원</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>{`수수료 수익 (${rev.data.fee_percent_label}% 적용)`}</div>
            <div className={s.kpiValueMd}>{rev.data.month_fee_amount.toLocaleString()}원</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>미정산 (주문 잔량 추정)</div>
            <div className={s.kpiValueWarn}>{rev.data.pending_settlement_amount.toLocaleString()}원</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>이번달 정산 기록 합계</div>
            <div className={s.kpiValueMd}>{rev.data.month_settled_amount.toLocaleString()}원</div>
          </div>
        </section>
      )}

      {!pend.success || !pend.data ? (
        <div className={s.alert}>{pend.error ?? '미정산 목록을 불러오지 못했습니다.'}</div>
      ) : (
        <>
          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>정산 상태 통합 뷰 (거래처별)</h2>
              <span className={s.inlineMuted}>정산 상태: 완료(초록) / 부분(노랑) / 미정산(빨강) · 30일 초과 시 경고</span>
            </div>
            {!unified.success || !unified.data ? (
              <div className={s.alert}>{unified.error ?? '통합 뷰 조회 실패'}</div>
            ) : unified.data.by_customer.length === 0 ? (
              <div className={s.empty}>표시할 항목이 없습니다.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['거래처', '공급 테넌트', '주문합', '수금합', '정산합', '미정산 잔액', '상태', '30일+'].map((h) => (
                        <th key={h} className={s.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unified.data.by_customer.map((c) => {
                      const anyOver30 = c.orders.some((o) => o.is_over_30_days)
                      const status =
                        c.total_remaining_balance <= 0
                          ? { cls: s.badgeScoreOk, label: '정산완료' }
                          : c.total_paid_amount > 0 || c.total_settled_amount > 0
                            ? { cls: s.badgeL2, label: '부분정산' }
                            : { cls: s.badgeCritical, label: '미정산' }
                      return (
                        <tr key={`${c.seller_tenant_id}:${c.customer_id}`}>
                          <td className={s.td}>
                            <div className={s.cellStrong}>{c.customer_name}</div>
                            <div className={s.cellMutedSm}>{c.customer_id ? `${c.customer_id.slice(0, 8)}…` : '—'}</div>
                          </td>
                          <td className={s.td}>{c.seller_tenant_id.slice(0, 8)}…</td>
                          <td className={s.td}>{Math.round(c.total_order_amount).toLocaleString()}원</td>
                          <td className={s.td}>{Math.round(c.total_paid_amount).toLocaleString()}원</td>
                          <td className={s.td}>{Math.round(c.total_settled_amount).toLocaleString()}원</td>
                          <td className={s.td}>{Math.round(c.total_remaining_balance).toLocaleString()}원</td>
                          <td className={s.td}>
                            <span className={status.cls}>{status.label}</span>
                          </td>
                          <td className={s.td}>{anyOver30 ? <span className={s.riskLabel}>경고</span> : <span className={s.mutedDash}>—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>거래처별 미정산 합계</h2>
              <span className={s.inlineMuted}>
                정산 주기: <strong>{pend.data.cycle_days}</strong>일 초과 시 위험 표시
              </span>
            </div>
            {pend.data.by_customer.length === 0 ? (
              <div className={s.empty}>표시할 항목이 없습니다.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['거래처', '공급 테넌트', '건수', '미정산 합계'].map((h) => (
                        <th key={h} className={s.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pend.data.by_customer.map((c) => (
                      <tr key={`${c.seller_tenant_id}:${c.customer_id}`}>
                        <td className={s.td}>{c.customer_name}</td>
                        <td className={s.td}>{c.seller_tenant_id.slice(0, 8)}…</td>
                        <td className={s.td}>{c.order_count}</td>
                        <td className={s.td}>{c.total_pending.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>미정산 주문</h2>
            </div>
            {pend.data.rows.length === 0 ? (
              <div className={s.empty}>미정산 주문이 없습니다.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['주문', '일자', '거래처', '금액', '경과일', '위험', '작업'].map((h) => (
                        <th key={h} className={s.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pend.data.rows.map((r) => (
                      <tr key={r.order_id}>
                        <td className={s.td}>{r.order_number}</td>
                        <td className={s.td}>{r.order_date}</td>
                        <td className={s.td}>{r.customer_name}</td>
                        <td className={s.td}>{r.amount.toLocaleString()}원</td>
                        <td className={s.td}>{r.days_pending}일</td>
                        <td className={s.td}>
                          {r.overdue_risk ? <span className={s.riskLabel}>정산 주기 초과</span> : <span className={s.mutedDash}>—</span>}
                        </td>
                        <td className={s.td}>
                          <SettleOrderButton orderId={r.order_id} orderNumber={r.order_number} amount={r.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>정산 이력 (최근 50건)</h2>
        </div>
        {!hist.success || !hist.data ? (
          <div className={s.alert}>{hist.error ?? '이력 조회 실패'}</div>
        ) : hist.data.length === 0 ? (
          <div className={s.empty}>정산 이력이 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['일시', '주문', '금액', '상태', '메모'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.data.map((row) => (
                  <tr key={row.id}>
                    <td className={s.td}>{String(row.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td className={s.td}>{row.order_id ? `${String(row.order_id).slice(0, 8)}…` : '—'}</td>
                    <td className={s.td}>{row.amount.toLocaleString()}원</td>
                    <td className={s.td}>{row.status}</td>
                    <td className={s.td}>{row.memo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
