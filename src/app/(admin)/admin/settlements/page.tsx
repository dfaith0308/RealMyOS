import Link from 'next/link'
import { getAutoSettlementSuggestions, getCreditLines, getGmvTrend, getPendingSettlements, getPlatformRevenue, getSettlementHistory, getUnifiedSettlementView } from '@/actions/admin/settlement-control'
import SettleOrderButton from './SettleOrderButton'
import s from '../../admin-shared.module.css'

export default async function AdminSettlementsPage() {
  const [rev, pend, unified, hist, gmv] = await Promise.all([
    getPlatformRevenue(),
    getPendingSettlements(),
    getUnifiedSettlementView(),
    getSettlementHistory(),
    getGmvTrend(),
  ])
  const [creditLines, suggestions] = await Promise.all([getCreditLines(), getAutoSettlementSuggestions()])

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
        <Link href="/admin/dashboard" className={s.ghostBtnMd}>
          대시보드
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

      {gmv.success && gmv.data && (
        <>
          <section className={`${s.panel} ${s.panelPadded}`}>
            <h2 className={s.panelTitle}>플랫폼 GMV (확정 주문 · 최근 30일)</h2>
            <div className={s.gmvAmount}>
              {gmv.data.gmv_30d.toLocaleString()}
              <span className={s.gmvSuffix}>원</span>
            </div>
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>월별 GMV 추이 (최근 6개월, 확정 주문)</h2>
            </div>
            <div className={s.chartRow}>
              {gmv.data.monthly.map((b) => {
                const max = Math.max(...gmv.data!.monthly.map((x) => x.gmv), 1)
                const h = Math.round((b.gmv / max) * 120)
                return (
                  <div key={b.month} className={s.chartCol}>
                    <div
                      title={`${b.gmv.toLocaleString()}원`}
                      className={s.chartBar}
                      style={{ ['--bar-h' as string]: `${Math.max(4, h)}px` }}
                    />
                    <div className={s.chartMonth}>{b.month.slice(5)}월</div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      {!pend.success || !pend.data ? (
        <div className={s.alert}>{pend.error ?? '미정산 목록을 불러오지 못했습니다.'}</div>
      ) : (
        <>
          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>신용한도 관리 (구조)</h2>
              <span className={s.inlineMuted}>FORENSIC-003-C · 기본 공식: score × 10,000원 · override는 admin_settings.credit_line_{`{tenant_id}`}</span>
            </div>
            {!creditLines.success || !creditLines.data ? (
              <div className={s.alert}>{creditLines.error ?? '조회 실패'}</div>
            ) : creditLines.data.length === 0 ? (
              <div className={s.empty}>신뢰도 배치 실행 후 신용한도가 계산됩니다</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['role', 'tenant', 'score', 'computed', 'override', 'effective'].map((h) => (
                        <th key={h} className={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {creditLines.data.slice(0, 50).map((r) => (
                      <tr key={`${r.role}:${r.tenant_id}`}>
                        <td className={s.td}>{r.role}</td>
                        <td className={s.td}>
                          <div className={s.cellStrong}>{r.tenant_name ?? r.tenant_id.slice(0, 8) + '…'}</div>
                          <div className={s.cellMutedSm}>{r.tenant_id}</div>
                        </td>
                        <td className={s.td}>{r.score ?? '-'}</td>
                        <td className={s.td}>{(r.computed_credit_line ?? 0).toLocaleString()}원</td>
                        <td className={s.td}>{r.override_credit_line != null ? `${r.override_credit_line.toLocaleString()}원` : '-'}</td>
                        <td className={s.td}>{(r.effective_credit_line ?? 0).toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>자동 정산 제안 (구조)</h2>
              <span className={s.inlineMuted}>FORENSIC-003-D · 조건 충족 시 “제안”만 (자동 실행 금지)</span>
            </div>
            {!suggestions.success || !suggestions.data ? (
              <div className={s.alert}>{suggestions.error ?? '조회 실패'}</div>
            ) : suggestions.data.length === 0 ? (
              <div className={s.empty}>정산 제안 항목이 없습니다</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['order', 'customer', 'amount', 'days_overdue', ''].map((h) => (
                        <th key={h} className={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.data.map((r) => (
                      <tr key={r.order_id}>
                        <td className={s.tdNowrap}>
                          <div className={s.cellStrong}>{r.order_number}</div>
                          <div className={s.cellMutedSm}>{r.order_id}</div>
                        </td>
                        <td className={s.td}>
                          <div className={s.cellStrong}>{r.customer_name ?? '-'}</div>
                          <div className={s.cellMutedSm}>{r.customer_id}</div>
                        </td>
                        <td className={s.tdNowrap}>{(r.amount ?? 0).toLocaleString()}원</td>
                        <td className={s.tdNowrap}>{r.days_pending}일</td>
                        <td className={s.tdNowrap}>
                          <SettleOrderButton orderId={r.order_id} orderNumber={r.order_number} amount={r.amount ?? 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>정산 상태 통합 뷰 (거래처별)</h2>
              <span className={s.inlineMuted}>FORENSIC-003-B · orders + payments + settlements 통합</span>
            </div>
            {!unified.success || !unified.data ? (
              <div className={s.alert}>{unified.error ?? '조회 실패'}</div>
            ) : unified.data.by_customer.length === 0 ? (
              <div className={s.empty}>표시할 거래처가 없습니다.</div>
            ) : (
              <div className={s.stackColGap12}>
                {unified.data.by_customer.slice(0, 20).map((g) => (
                  <div key={g.customer_id} className={s.panelInset}>
                    <div className={s.panelHeader}>
                      <h3 className={s.panelTitleSm}>{g.customer_name ?? '-'}</h3>
                      <span className={s.inlineMuted}>{g.customer_id}</span>
                    </div>
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <thead>
                          <tr className={s.theadRow}>
                            {['order_number', 'order_status', 'order_amount', 'paid_amount', 'settled_amount', 'pending_settlement', ''].map((h) => (
                              <th key={h} className={s.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.orders.map((o) => (
                            <tr key={o.order_id}>
                              <td className={s.tdNowrap}>
                                <div className={s.cellStrong}>{o.order_number}</div>
                                <div className={s.cellMutedSm}>{o.order_id}</div>
                              </td>
                              <td className={s.tdNowrap}>{o.status_label ?? '-'}</td>
                              <td className={s.tdNowrap}>{(o.order_amount ?? 0).toLocaleString()}원</td>
                              <td className={s.tdNowrap}>{(o.paid_amount ?? 0).toLocaleString()}원</td>
                              <td className={s.tdNowrap}>{(o.settled_amount ?? 0).toLocaleString()}원</td>
                              <td className={s.tdNowrap}>{(o.remaining_balance ?? 0).toLocaleString()}원</td>
                              <td className={s.tdNowrap}>
                                {o.remaining_balance > 0 ? (
                                  <SettleOrderButton orderId={o.order_id} orderNumber={o.order_number} amount={o.remaining_balance} />
                                ) : (
                                  <span className={s.inlineMuted}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>미정산 주문</h2>
              <span className={s.inlineMuted}>총 {pend.data.rows.length}건</span>
            </div>
            {pend.data.rows.length === 0 ? (
              <div className={s.empty}>미정산 주문이 없습니다.</div>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['주문', '거래처', '금액', '주문상태', '확정일', ''].map((h) => (
                        <th key={h} className={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pend.data.rows.slice(0, 100).map((r) => (
                      <tr key={r.order_id}>
                        <td className={s.tdNowrap}>
                          <div className={s.cellStrong}>{r.order_number}</div>
                          <div className={s.cellMutedSm}>{r.order_id}</div>
                        </td>
                        <td className={s.td}>
                          <div className={s.cellStrong}>{r.customer_name ?? '-'}</div>
                          <div className={s.cellMutedSm}>{r.customer_id}</div>
                        </td>
                        <td className={s.tdNowrap}>{(r.amount ?? 0).toLocaleString()}원</td>
                        <td className={s.tdNowrap}>{r.overdue_risk ? <span className={s.badgeHigh}>위험</span> : <span className={s.badgeNormal}>정상</span>}</td>
                        <td className={s.tdNowrap}>{r.days_pending}일</td>
                        <td className={s.tdNowrap}>
                          <SettleOrderButton orderId={r.order_id} orderNumber={r.order_number} amount={r.amount ?? 0} />
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
          <h2 className={s.panelTitle}>정산 이력</h2>
          <span className={s.inlineMuted}>최근 {hist.success && hist.data ? hist.data.length : 0}건</span>
        </div>
        {!hist.success || !hist.data ? (
          <div className={s.alert}>{hist.error ?? '정산 이력 조회 실패'}</div>
        ) : hist.data.length === 0 ? (
          <div className={s.empty}>정산 이력이 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['date', 'order', 'amount', 'memo'].map((h) => (
                    <th key={h} className={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.data.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td className={s.tdNowrap}>{String(r.created_at).slice(0, 16).replace('T', ' ')}</td>
                    <td className={s.tdNowrap}>
                      <div className={s.cellStrong}>{r.order_id ? r.order_id.slice(0, 8) + '…' : '-'}</div>
                      <div className={s.cellMutedSm}>{r.order_id ?? '-'}</div>
                    </td>
                    <td className={s.tdNowrap}>{(r.amount ?? 0).toLocaleString()}원</td>
                    <td className={s.tdWide}>{r.memo ?? '-'}</td>
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

