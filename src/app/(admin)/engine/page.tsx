import Link from 'next/link'
import { getRiskSummary, runAnalysisEngine } from '@/actions/admin/analysis-engine'
import { getActionQueue } from '@/actions/admin/action-queue'

export default async function AdminEnginePage() {
  const [risk, q] = await Promise.all([
    getRiskSummary(),
    getActionQueue(),
  ])

  const queue = q.data ?? []
  const recent = queue.slice(0, 20)

  async function run() {
    'use server'
    await runAnalysisEngine()
  }

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>판단/분석 엔진</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
            입력(Intelligence) → 판단(Decision) → 우선순위(Priority) → 출력(Trigger Routing) → 오탐 피드백
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/admin/trades" style={ghostBtn}>Action Queue로 이동</Link>
          <form action={run}>
            <button type="submit" style={primaryBtn}>분석 실행</button>
          </form>
        </div>
      </header>

      {!risk.success || !risk.data ? (
        <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          {risk.error ?? '요약 조회 실패'}
        </div>
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <Kpi title="신뢰도 위험" value={risk.data.trust_risk_count} />
          <Kpi title="거래 위험" value={risk.data.trade_risk_count} />
          <Kpi title="미정산 위험" value={risk.data.settlement_risk_count} />
          <Kpi title="미처리 Queue" value={risk.data.action_queue_open_count} />
        </section>
      )}

      <section style={panel}>
        <div style={panelHeader}>
          <h2 style={panelTitle}>최근 감지 이력 (Action Queue)</h2>
          <Link href="/admin/trades" style={ghostBtn}>관제</Link>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>표시할 항목이 없습니다.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['priority', 'category', 'title', 'created_at'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((it) => (
                  <tr key={it.id}>
                    <td style={td}>{it.priority}</td>
                    <td style={td}>{it.category}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 900, color: '#111827' }}>{it.title}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{it.description ?? ''}</div>
                    </td>
                    <td style={td}>{String(it.created_at).slice(0, 16).replace('T', ' ')}</td>
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
const panelHeader: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

const primaryBtn: React.CSSProperties = { padding: '9px 14px', border: 'none', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '9px 14px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#111827', fontSize: 13, fontWeight: 900, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

