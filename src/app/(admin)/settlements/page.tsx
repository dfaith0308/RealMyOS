import Link from 'next/link'
import { getPendingSettlements, getPlatformRevenue, getSettlementHistory } from '@/actions/admin/settlement-control'
import SettleOrderButton from './SettleOrderButton'

export default async function AdminSettlementsPage() {
  const [rev, pend, hist] = await Promise.all([getPlatformRevenue(), getPendingSettlements(), getSettlementHistory()])

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>수익/정산 통제</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0', maxWidth: 780 }}>
            PRODUCT §10-9 — 정산은 관리자 확인 버튼 이후에만 기록됩니다. 수수료율은 <code style={{ fontSize: 12 }}>admin_settings</code>{' '}
            에서만 조회합니다.
          </p>
        </div>
        <Link href="/admin/growth" style={ghostBtn}>
          성장 엔진
        </Link>
      </header>

      {!rev.success || !rev.data ? (
        <div style={alert}>{rev.error ?? '수익 현황을 불러오지 못했습니다.'}</div>
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <Kpi title="이번달 GMV (확정)" value={`${rev.data.month_gmv.toLocaleString()}원`} />
          <Kpi
            title={`수수료 수익 (${rev.data.fee_percent_label}% 적용)`}
            value={`${rev.data.month_fee_amount.toLocaleString()}원`}
          />
          <Kpi title="미정산 (주문 잔량 추정)" value={`${rev.data.pending_settlement_amount.toLocaleString()}원`} accent="#b45309" />
          <Kpi title="이번달 정산 기록 합계" value={`${rev.data.month_settled_amount.toLocaleString()}원`} />
        </section>
      )}

      {!pend.success || !pend.data ? (
        <div style={alert}>{pend.error ?? '미정산 목록을 불러오지 못했습니다.'}</div>
      ) : (
        <>
          <section style={panel}>
            <div style={panelHeader}>
              <h2 style={panelTitle}>거래처별 미정산 합계</h2>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                정산 주기: <strong>{pend.data.cycle_days}</strong>일 초과 시 위험 표시
              </span>
            </div>
            {pend.data.by_customer.length === 0 ? (
              <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>표시할 항목이 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['거래처', '공급 테넌트', '건수', '미정산 합계'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pend.data.by_customer.map((c) => (
                      <tr key={`${c.seller_tenant_id}:${c.customer_id}`}>
                        <td style={td}>{c.customer_name}</td>
                        <td style={td}>{c.seller_tenant_id.slice(0, 8)}…</td>
                        <td style={td}>{c.order_count}</td>
                        <td style={td}>{c.total_pending.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={panel}>
            <div style={panelHeader}>
              <h2 style={panelTitle}>미정산 주문</h2>
            </div>
            {pend.data.rows.length === 0 ? (
              <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>미정산 주문이 없습니다.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                  {['주문', '일자', '거래처', '금액', '경과일', '위험', '작업'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pend.data.rows.map((r) => (
                      <tr key={r.order_id}>
                        <td style={td}>{r.order_number}</td>
                        <td style={td}>{r.order_date}</td>
                        <td style={td}>{r.customer_name}</td>
                        <td style={td}>{r.amount.toLocaleString()}원</td>
                        <td style={td}>{r.days_pending}일</td>
                        <td style={td}>
                          {r.overdue_risk ? (
                            <span style={{ color: '#b45309', fontWeight: 900 }}>정산 주기 초과</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>—</span>
                          )}
                        </td>
                        <td style={td}>
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

      <section style={panel}>
        <div style={panelHeader}>
          <h2 style={panelTitle}>정산 이력 (최근 50건)</h2>
        </div>
        {!hist.success || !hist.data ? (
          <div style={{ padding: 14, color: '#DC2626', fontSize: 13 }}>{hist.error ?? '이력 조회 실패'}</div>
        ) : hist.data.length === 0 ? (
          <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>정산 이력이 없습니다.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['일시', '주문', '금액', '상태', '메모'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.data.map((row) => (
                  <tr key={row.id}>
                    <td style={td}>{String(row.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td style={td}>{row.order_id ? `${String(row.order_id).slice(0, 8)}…` : '—'}</td>
                    <td style={td}>{row.amount.toLocaleString()}원</td>
                    <td style={td}>{row.status}</td>
                    <td style={td}>{row.memo ?? '—'}</td>
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

function Kpi({ title, value, accent }: { title: string; value: string; accent?: string }) {
  return (
    <div style={card}>
      <div style={cardTitle}>{title}</div>
      <div style={{ ...cardValue, color: accent ?? '#111827' }}>{value}</div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const cardTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 800 }
const cardValue: React.CSSProperties = { fontSize: 22, fontWeight: 900 }

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }
const panelHeader: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #f3f4f6',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

const alert: React.CSSProperties = {
  background: '#FEF2F2',
  color: '#DC2626',
  border: '1px solid #FECACA',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
}

const ghostBtn: React.CSSProperties = {
  padding: '9px 14px',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  background: '#fff',
  color: '#111827',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
}
