import { getDisbursementList } from '@/actions/payment'
import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import DisbursementsClient from '@/components/disbursements/DisbursementsClient'

export const metadata = { title: '지급 목록 — RealMyOS' }

export default async function DisbursementsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const status = searchParams.status ?? ''

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const listResult = await getDisbursementList({
    status: status || undefined,
  })

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>지급 목록</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
          매입처 지급(outbound) · 최근 50건 · 예정일 오름차순
        </p>
      </div>

      {!listResult.success ? (
        <p style={{ color: '#B91C1C', fontSize: 14 }}>{listResult.error}</p>
      ) : (
        <DisbursementsClient rows={listResult.data ?? []} filters={{ status }} />
      )}
    </main>
  )
}
