import { approveTenant, getTenantList, suspendTenant } from '@/actions/admin'
import { revalidatePath } from 'next/cache'

type Filter = 'pending' | 'approved' | 'suspended' | 'all'

export default async function AdminTenantsPage(props: {
  searchParams?: Promise<{ filter?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const filterRaw = Array.isArray(searchParams?.filter) ? searchParams?.filter?.[0] : searchParams?.filter
  const filter: Filter =
    filterRaw === 'pending' || filterRaw === 'approved' || filterRaw === 'suspended' || filterRaw === 'all'
      ? filterRaw
      : 'pending'

  const res = await getTenantList()
  if (!res.success) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>테넌트 관리</h1>
        <div style={errStyle}>{res.error}</div>
      </main>
    )
  }

  const all = res.data.tenants
  const filtered = all.filter((t) => {
    const approved = t.is_approved === true
    if (filter === 'approved') return approved
    if (filter === 'pending') return !approved
    if (filter === 'suspended') return !approved
    return true
  })

  async function toggleApproval(formData: FormData) {
    'use server'
    const tenant_id = String(formData.get('tenant_id') ?? '')
    const next = String(formData.get('next') ?? '')

    const r = next === 'approve' ? await approveTenant(tenant_id) : await suspendTenant(tenant_id)
    if (!r.success) throw new Error(r.error)
    revalidatePath('/admin/tenants')
    revalidatePath('/admin/dashboard')
  }

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>테넌트 관리</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          승인 상태 필터 및 승인/정지 토글
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <FilterLink active={filter === 'pending'} href="/admin/tenants?filter=pending" label={`승인 대기 (${all.filter((t) => t.is_approved !== true).length})`} />
        <FilterLink active={filter === 'approved'} href="/admin/tenants?filter=approved" label={`승인됨 (${all.filter((t) => t.is_approved === true).length})`} />
        <FilterLink active={filter === 'suspended'} href="/admin/tenants?filter=suspended" label={`정지 (${all.filter((t) => t.is_approved !== true).length})`} />
        <FilterLink active={filter === 'all'} href="/admin/tenants?filter=all" label={`전체 (${all.length})`} />
      </nav>

      <section style={panelStyle}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>role</th>
                <th style={thStyle}>승인</th>
                <th style={thStyle}>생성일</th>
                <th style={thStyle}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const approved = t.is_approved === true
                return (
                  <tr key={t.id}>
                    <td style={tdStyle}>{t.name ?? '-'}</td>
                    <td style={tdStyle}>{t.role ?? '-'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        ...badgeStyle,
                        background: approved ? '#ECFDF3' : '#FFFBEB',
                        color: approved ? '#027A48' : '#B54708',
                        borderColor: approved ? '#ABEFC6' : '#FDE68A',
                      }}>
                        {approved ? '승인됨' : '대기/정지'}
                      </span>
                    </td>
                    <td style={tdStyle}>{t.created_at ? new Date(t.created_at).toLocaleString('ko-KR') : '-'}</td>
                    <td style={tdStyle}>
                      <form action={toggleApproval} style={{ display: 'inline' }}>
                        <input type="hidden" name="tenant_id" value={t.id} />
                        <input type="hidden" name="next" value={approved ? 'suspend' : 'approve'} />
                        <button style={approved ? dangerBtnStyle : primaryBtnStyle} type="submit">
                          {approved ? '정지' : '승인'}
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
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
        border: '1px solid #e5e7eb',
        background: active ? 'var(--color-primary-light)' : '#fff',
        color: active ? 'var(--color-primary)' : '#374151',
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
  background: '#FEF2F2',
  color: '#DC2626',
  border: '1px solid #FECACA',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
}

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
}

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

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  border: '1px solid',
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 700,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 10,
  border: '1px solid #111827',
  background: '#111827',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const dangerBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  border: '1px solid #B42318',
  background: '#B42318',
}

