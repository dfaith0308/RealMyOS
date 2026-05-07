import { getPurchaseList } from '@/actions/purchase'
import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import PurchaseListClient from '@/components/purchases/PurchaseListClient'
import Link from 'next/link'

export const metadata = { title: '매입 목록 — RealMyOS' }

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const status = searchParams.status ?? ''

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const listResult = await getPurchaseList({ status: status || undefined })

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>매입 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            {listResult.data?.length ?? 0}건
          </p>
        </div>
        <Link href="/purchases/new"
          style={{ padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          + 매입 등록
        </Link>
      </div>

      {!listResult.success ? (
        <p style={{ color: '#B91C1C', fontSize: 14 }}>{listResult.error}</p>
      ) : (
        <PurchaseListClient rows={listResult.data ?? []} filters={{ status }} />
      )}
    </main>
  )
}
