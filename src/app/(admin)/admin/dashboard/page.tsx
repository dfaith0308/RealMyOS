import Link from 'next/link'
import { getAdminDashboard } from '@/actions/admin'
import { expireStaleItems, getActionQueue, resolveActionQueueItem } from '@/actions/admin/action-queue'

export default async function AdminDashboardPage() {
  // 72h 초과 항목 만료 처리 (best-effort; 실패해도 페이지는 보여준다)
  await expireStaleItems().catch(() => {})

  const [d, q] = await Promise.all([
    getAdminDashboard(),
    getActionQueue(),
  ])

  if (!d.success) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>관리자 대시보드</h1>
        <div style={{
          background: '#FEF2F2', color: '#DC2626',
          border: '1px solid #FECACA', borderRadius: 10,
          padding: '10px 12px', fontSize: 13,
        }}>
          {d.error}
        </div>
      </main>
    )
  }

  const queue = q.data ?? []
  const critical = queue.filter((x) => x.priority === 'critical').slice(0, 10)
  const today = queue.filter((x) => x.priority === 'today').slice(0, 10)

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>중앙 대시보드</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          상태(What) + 행동(Action) + 우선순위(Priority) + 실행 큐(Queue)
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={cardTitle}>전체 테넌트</div>
          <div style={cardValue}>{d.data.counts.total}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardTitle}>승인 대기</div>
          <div style={cardValue}>{d.data.counts.pendingApproval}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardTitle}>승인 완료</div>
          <div style={cardValue}>{d.data.counts.approved}</div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <QueuePanel title="[1순위] Critical — 즉시 개입" items={critical} />
        <QueuePanel title="[2순위] Today — 오늘 처리" items={today} />
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <h2 style={panelTitleStyle}>최근 가입 테넌트</h2>
          <Link href="/admin/tenants" style={linkBtnStyle}>관리</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>role</th>
                <th style={thStyle}>승인여부</th>
                <th style={thStyle}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {d.data.recentTenants.map((t) => (
                <tr key={t.id}>
                  <td style={tdStyle}>{t.name ?? '-'}</td>
                  <td style={tdStyle}>{t.role ?? '-'}</td>
                  <td style={tdStyle}>{t.is_approved ? '승인' : '대기'}</td>
                  <td style={tdStyle}>{t.created_at ? new Date(t.created_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
              {d.data.recentTenants.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={4}>데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <h2 style={panelTitleStyle}>최근 관리자 로그</h2>
          <Link href="/admin/logs" style={linkBtnStyle}>전체</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>action_type</th>
                <th style={thStyle}>admin_id</th>
                <th style={thStyle}>tenant_id</th>
                <th style={thStyle}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {d.data.recentAdminLogs.map((l) => (
                <tr key={l.id}>
                  <td style={tdStyle}>{l.action_type ?? '-'}</td>
                  <td style={tdStyle}>{l.admin_id ?? '-'}</td>
                  <td style={tdStyle}>{l.tenant_id ?? '-'}</td>
                  <td style={tdStyle}>{l.created_at ? new Date(l.created_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
              {d.data.recentAdminLogs.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={4}>admin_logs 테이블이 없거나 로그가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function QueuePanel({ title, items }: { title: string; items: any[] }) {
  async function resolve(id: string) {
    'use server'
    await resolveActionQueueItem(id)
  }

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <h2 style={panelTitleStyle}>{title}</h2>
        <Link href="/admin/trades" style={linkBtnStyle}>관제</Link>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 14, color: '#9ca3af', fontSize: 13 }}>
          항목이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it) => (
            <div key={it.id} style={{
              padding: '12px 14px',
              borderTop: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.title}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.description ?? ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <form action={resolve.bind(null, it.id)}>
                  <button type="submit" style={primaryBtnStyle}>처리</button>
                </form>
                <Link href="/admin/trades" style={ghostBtnStyle}>상세</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
}
const cardTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 8 }
const cardValue: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: '#111827' }

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
}
const panelHeaderStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #f3f4f6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}
const panelTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: 0 }

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  color: '#6b7280',
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#111827',
  padding: '10px 12px',
  borderBottom: '1px solid #f9fafb',
  whiteSpace: 'nowrap',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 12px',
  border: 'none',
  borderRadius: 8,
  background: '#111827',
  color: '#fff',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}
const ghostBtnStyle: React.CSSProperties = {
  padding: '7px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fff',
  color: '#111827',
  fontSize: 12,
  fontWeight: 800,
  textDecoration: 'none',
}
const linkBtnStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: '#111827',
  textDecoration: 'none',
  border: '1px solid #e5e7eb',
  padding: '6px 10px',
  borderRadius: 8,
  background: '#fff',
}

