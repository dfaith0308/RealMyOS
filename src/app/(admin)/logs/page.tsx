import { getAdminLogs } from '@/actions/admin'

export default async function AdminLogsPage(props: {
  searchParams?: Promise<{ action_type?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const actionTypeRaw = Array.isArray(searchParams?.action_type) ? searchParams?.action_type?.[0] : searchParams?.action_type
  const action_type = actionTypeRaw?.trim() ? actionTypeRaw : null

  const res = await getAdminLogs({ action_type })
  if (!res.success) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>관리자 로그</h1>
        <div style={errStyle}>{res.error}</div>
      </main>
    )
  }

  const logs = res.data.logs
  const actionTypes = Array.from(new Set(logs.map((l) => l.action_type).filter(Boolean))) as string[]

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>관리자 로그</h1>
        <p style={{ fontSize: 13, color: 'var(--ds-text-secondary)' }}>
          최근 관리자 행동 기록 (action_type 필터)
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <FilterLink active={!action_type} href="/admin/logs" label="전체" />
        {actionTypes.slice(0, 12).map((t) => (
          <FilterLink
            key={t}
            active={action_type === t}
            href={`/admin/logs?action_type=${encodeURIComponent(t)}`}
            label={t}
          />
        ))}
      </nav>

      <section style={panelStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>action_type</th>
                <th style={thStyle}>reason</th>
                <th style={thStyle}>admin_id</th>
                <th style={thStyle}>tenant_id</th>
                <th style={thStyle}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={tdStyle}>{l.action_type ?? '-'}</td>
                  <td style={tdStyle}>{(l as any).reason ?? '-'}</td>
                  <td style={tdStyle}>{l.admin_id ?? '-'}</td>
                  <td style={tdStyle}>{l.tenant_id ?? '-'}</td>
                  <td style={tdStyle}>{l.created_at ? new Date(l.created_at).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={5}>데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      style={{
        padding: '8px 10px',
        borderRadius: 999,
        border: '1px solid var(--ds-border-default)',
        background: active ? 'var(--color-primary-light)' : 'var(--ds-surface-card)',
        color: active ? 'var(--color-primary)' : 'var(--ds-text-primary)',
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
    </a>
  )
}

const errStyle: React.CSSProperties = {
  background: 'var(--ds-status-danger-bg, #FEF2F2)',
  color: 'var(--ds-status-danger)',
  border: '1px solid var(--ds-status-danger-border, #FECACA)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
}

const panelStyle: React.CSSProperties = {
  background: 'var(--ds-surface-card)',
  border: '1px solid var(--ds-border-default)',
  borderRadius: 12,
  overflow: 'hidden',
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
  padding: '10px 12px',
  borderBottom: '1px solid var(--ds-border-subtle)',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ds-text-primary)',
  padding: '10px 12px',
  borderBottom: '1px solid var(--ds-border-subtle)',
  whiteSpace: 'nowrap',
}

