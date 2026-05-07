import Link from 'next/link'
import { getActionQueue, resolveActionQueueItem } from '@/actions/admin/action-queue'
import { upsertActionQueueForTradeAnomalies } from '@/actions/admin/trade-monitor'

function hoursSince(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / 3600000)
}

export default async function AdminTradeMonitorPage() {
  // 화면 진입 시 이상 감지 → Action Queue 연결 (시스템 생성, UI 수동 생성 금지)
  await upsertActionQueueForTradeAnomalies().catch(() => {})

  const [tradeQ, settleQ] = await Promise.all([
    getActionQueue({ category: 'trade' }),
    getActionQueue({ category: 'settlement' }),
  ])

  const tradeItems = tradeQ.data ?? []
  const settleItems = settleQ.data ?? []

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>거래 흐름 관제</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
            이상 감지 → 자동 개입(Level) → Action Queue 생성 → 관리자 예외 처리
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/dashboard" style={ghostBtn}>대시보드</Link>
          <Link href="/rfq" style={ghostBtn}>RFQ 보기</Link>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div style={kpiCard}>
          <div style={kpiTitle}>Trade 이상</div>
          <div style={kpiValue}>{tradeItems.length}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiTitle}>Settlement 이상</div>
          <div style={kpiValue}>{settleItems.length}</div>
        </div>
      </section>

      <Panel title="이상 감지 목록 — Trade" items={tradeItems} />
      <Panel title="이상 감지 목록 — Settlement" items={settleItems} />
    </main>
  )
}

function Panel({ title, items }: { title: string; items: any[] }) {
  async function resolve(id: string) {
    'use server'
    await resolveActionQueueItem(id)
  }

  return (
    <section style={panel}>
      <div style={panelHeader}>
        <h2 style={panelTitle}>{title}</h2>
        <div style={{ fontSize: 12, color: '#6b7280' }}>총 {items.length}건</div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>이상 감지 항목이 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['우선순위', '카테고리', '제목', '체류(시간)', '생성', ''].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={td}><BadgePriority p={it.priority} /></td>
                  <td style={td}>{it.category}</td>
                  <td style={{ ...td, maxWidth: 520 }}>
                    <div style={{ fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.description ?? ''}
                    </div>
                  </td>
                  <td style={td}>{hoursSince(it.created_at)}h</td>
                  <td style={td}>{String(it.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td style={td}>
                    <form action={resolve.bind(null, it.id)}>
                      <button type="submit" style={primaryBtn}>처리</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function BadgePriority({ p }: { p: string }) {
  const m: Record<string, { bg: string; color: string; label: string }> = {
    critical: { bg: '#FEE2E2', color: '#B91C1C', label: 'Critical' },
    high: { bg: '#FFEDD5', color: '#9A3412', label: 'High' },
    today: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Today' },
    normal: { bg: '#F3F4F6', color: '#374151', label: 'Normal' },
  }
  const s = m[p] ?? m.normal
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 900,
      padding: '2px 8px',
      borderRadius: 999,
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  )
}

const kpiCard: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const kpiTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 6, fontWeight: 700 }
const kpiValue: React.CSSProperties = { fontSize: 28, color: '#111827', fontWeight: 900 }

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }
const panelHeader: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', whiteSpace: 'nowrap' }

const primaryBtn: React.CSSProperties = { padding: '7px 12px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontSize: 12, fontWeight: 900, textDecoration: 'none' }

