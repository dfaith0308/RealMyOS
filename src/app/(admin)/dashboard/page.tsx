import { getAdminDashboard } from '@/actions/admin'

export default async function AdminDashboardPage() {
  const d = await getAdminDashboard()

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

  const { counts, recentTenants, recentAdminLogs } = d.data

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>관리자 대시보드</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          전체 테넌트 요약 및 최근 활동
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={cardTitle}>전체 테넌트</div>
          <div style={cardValue}>{counts.total}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardTitle}>승인 대기</div>
          <div style={cardValue}>{counts.pendingApproval}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardTitle}>승인 완료</div>
          <div style={cardValue}>{counts.approved}</div>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <h2 style={panelTitleStyle}>최근 가입 테넌트</h2>
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
              {recentTenants.map((t) => (
                <tr key={t.id}>
                  <td style={tdStyle}>{t.name ?? '-'}</td>
                  <td style={tdStyle}>{t.role ?? '-'}</td>
                  <td style={tdStyle}>{t.is_approved ? '승인' : '대기'}</td>
                  <td style={tdStyle}>{t.created_at ? new Date(t.created_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
              {recentTenants.length === 0 && (
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
              {recentAdminLogs.map((l) => (
                <tr key={l.id}>
                  <td style={tdStyle}>{l.action_type ?? '-'}</td>
                  <td style={tdStyle}>{l.admin_id ?? '-'}</td>
                  <td style={tdStyle}>{l.tenant_id ?? '-'}</td>
                  <td style={tdStyle}>{l.created_at ? new Date(l.created_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
              {recentAdminLogs.length === 0 && (
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
}
const panelTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0 }

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

