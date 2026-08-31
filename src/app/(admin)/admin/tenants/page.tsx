import { getTenantAdminList } from '@/actions/admin'
import TenantsClient from './TenantsClient'

export default async function AdminTenantsPage() {
  const res = await getTenantAdminList()

  if (!res.success) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>회원관리</h1>
        <div
          style={{
            background: 'var(--ds-status-danger-bg, #FEF2F2)',
            color: 'var(--ds-status-danger)',
            border: '1px solid var(--ds-status-danger-border, #FECACA)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13,
          }}
        >
          {res.error}
        </div>
      </main>
    )
  }

  return <TenantsClient initial={res.data.tenants} initialError={null} />
}
