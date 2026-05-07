import Link from 'next/link'
import { getAdminSettings } from '@/actions/admin/policy-console'
import PolicyConsoleClient from './PolicyConsoleClient'

export default async function AdminPolicyPage() {
  const res = await getAdminSettings()

  if (!res.success || !res.data) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>정책/실험 콘솔</h1>
        <p style={{ color: '#DC2626', marginTop: 12 }}>{res.error ?? '설정을 불러오지 못했습니다.'}</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>정책/실험 콘솔</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0', maxWidth: 820 }}>
            PRODUCT §10-10 — 코드 배포 없이 플랫폼 정책을 변경합니다. 모든 변경은 admin_logs에 이전/이후 값과 변경자로 기록됩니다.
          </p>
        </div>
        <Link href="/admin/settlements" style={ghostBtn}>
          수익/정산
        </Link>
      </header>

      <PolicyConsoleClient initial={res.data.grouped} />
    </main>
  )
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
