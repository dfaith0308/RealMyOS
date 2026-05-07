import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getMyBids, getSupplierRfqs } from '@/actions/rfq'
import RfqHubClient from '@/components/rfq/RfqHubClient'

export const metadata = { title: '발주요청 — RealMyOS' }

export default async function RfqPage() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [rfqRes, bidsRes] = await Promise.all([getSupplierRfqs(), getMyBids()])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>발주요청 (RFQ)</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
          오픈된 발주요청과 내가 제출한 입찰을 확인합니다.
        </p>
      </div>

      <RfqHubClient
        supplierRfqs={rfqRes.data ?? []}
        myBids={bidsRes.data ?? []}
        rfqError={rfqRes.error}
        bidsError={bidsRes.error}
      />
    </main>
  )
}
