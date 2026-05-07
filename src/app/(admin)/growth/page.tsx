import Link from 'next/link'
import { getGrowthMetrics } from '@/actions/admin/growth-engine'
import { submitGrowthChurnEnqueue, submitGrowthDormantEnqueue } from './actions'

export default async function AdminGrowthPage() {
  const metrics = await getGrowthMetrics()

  if (!metrics.success || !metrics.data) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>성장/영업 엔진</h1>
        <p style={{ color: '#DC2626', marginTop: 12 }}>{metrics.error ?? '지표를 불러오지 못했습니다.'}</p>
      </main>
    )
  }

  const m = metrics.data
  const maxMonth = Math.max(...m.monthly_gmv_trend.map((x) => x.gmv), 1)

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>성장/영업 엔진</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0', maxWidth: 720 }}>
            PRODUCT §10-8 — 타깃 자동 생성·우선순위 실행. 아래 버튼은 규칙 기반 감지로 Action Queue를 적재합니다.
          </p>
        </div>
        <Link href="/admin/engine" style={ghostBtn}>
          분석 엔진
        </Link>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <Kpi title="신규 참여자 (30일)" value={m.new_participants_30d} />
        <Kpi title="활성 참여자 (30일)" value={m.active_participants_30d} />
        <Kpi title="이탈 위험 (추정)" value={m.churn_risk_customers} />
        <Kpi title="휴면 참여자 (추정)" value={m.dormant_tenants} />
      </section>

      <section style={{ ...panel, padding: 16 }}>
        <h2 style={panelTitle}>플랫폼 GMV (확정 주문 · 최근 30일)</h2>
        <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>
          {m.platform_gmv_30d.toLocaleString()}
          <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 6, color: '#6b7280' }}>원</span>
        </div>
      </section>

      <section style={panel}>
        <div style={panelHeader}>
          <h2 style={panelTitle}>월별 GMV 추이 (최근 6개월, 확정 주문)</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 160 }}>
          {m.monthly_gmv_trend.map((b) => {
            const h = Math.round((b.gmv / maxMonth) * 120)
            return (
              <div key={b.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  title={`${b.gmv.toLocaleString()}원`}
                  style={{
                    width: '100%',
                    height: Math.max(4, h),
                    borderRadius: 8,
                    background: 'linear-gradient(180deg, var(--color-primary, #047857), #065f46)',
                  }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700 }}>{b.month.slice(5)}월</div>
              </div>
            )
          })}
        </div>
      </section>

      <section style={panel}>
        <div style={{ ...panelHeader, justifyContent: 'space-between', gap: 12 }}>
          <h2 style={panelTitle}>이탈 위험 거래처 · 신뢰 급락 신호</h2>
          <form action={submitGrowthChurnEnqueue}>
            <button type="submit" style={primaryBtn}>
              Action Queue 생성
            </button>
          </form>
        </div>
        {m.churn_customer_rows.length === 0 ? (
          <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>표시할 항목이 없습니다.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['공급 테넌트', '거래처', '사유', '마지막 주문일'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.churn_customer_rows.map((r) => (
                  <tr key={`${r.seller_tenant_id}:${r.customer_id}:${r.reasons.join(',')}`}>
                    <td style={td}>{r.seller_tenant_id.slice(0, 8)}…</td>
                    <td style={td}>{r.customer_name}</td>
                    <td style={td}>{r.reasons.join(' · ')}</td>
                    <td style={td}>{r.last_order_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={panel}>
        <div style={{ ...panelHeader, justifyContent: 'space-between', gap: 12 }}>
          <h2 style={panelTitle}>휴면 참여자 (로그인·거래 90일 무신호)</h2>
          <form action={submitGrowthDormantEnqueue}>
            <button type="submit" style={secondaryBtn}>
              재활성화 Action Queue 생성
            </button>
          </form>
        </div>
        {m.dormant_rows.length === 0 ? (
          <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>표시할 항목이 없습니다.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['참여자', '마지막 로그인(추정)', '마지막 거래 신호'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.dormant_rows.map((r) => (
                  <tr key={r.tenant_id}>
                    <td style={td}>{r.tenant_label}</td>
                    <td style={td}>{r.last_login_at ? String(r.last_login_at).slice(0, 10) : '—'}</td>
                    <td style={td}>{r.last_trade_at ?? '—'}</td>
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

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div style={card}>
      <div style={cardTitle}>{title}</div>
      <div style={cardValue}>{value}</div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const cardTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 800 }
const cardValue: React.CSSProperties = { fontSize: 26, fontWeight: 900, color: '#111827' }

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }
const panelHeader: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

const primaryBtn: React.CSSProperties = {
  padding: '9px 14px',
  border: 'none',
  borderRadius: 10,
  background: '#111827',
  color: '#fff',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: '#047857',
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
