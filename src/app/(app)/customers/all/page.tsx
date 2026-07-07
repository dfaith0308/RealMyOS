import Link from 'next/link'
import CustomerBulkUpload from '@/components/customer/CustomerBulkUpload'
import CustomerListAllClient from '@/components/customer/CustomerListAllClient'
import { getCustomerList } from '@/actions/customer-query'

export const metadata = { title: '거래처 목록 — RealMyOS' }

export default async function CustomerListPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; status?: string; safe?: string }
}) {
  const { q, type, status, safe } = searchParams
  const safeActive = safe === '1'
  const result = await getCustomerList({ safe_number: safeActive })
  const all = result.data ?? []

  const filtered = all.filter((c) => {
    if (q && !c.name.includes(q) && !(c.phone ?? '').includes(q)) return false
    if (type && c.customer_type !== type) return false
    if (status && c.trade_status !== status) return false
    return true
  })

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>거래처 목록</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/customers" style={s.subBtn}>← 행동 대시보드</Link>
          <Link href="/customers/new" style={s.newBtn}>+ 거래처 등록</Link>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CustomerBulkUpload />
      </div>

      <CustomerListAllClient
        customers={filtered}
        totalCount={all.length}
        q={q}
        type={type}
        status={status}
        safeActive={safeActive}
      />
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  subBtn: { padding: '8px 14px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' },
  newBtn: { padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
}
