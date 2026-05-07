import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getMyBidForRfq, getRfqDetail } from '@/actions/rfq'
import RfqDetailClient from '@/components/rfq/RfqDetailClient'

export const metadata = { title: '발주요청 상세 — RealMyOS' }

export default async function RfqDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [detailRes, bidRes] = await Promise.all([
    getRfqDetail(params.id),
    getMyBidForRfq(params.id),
  ])

  if (detailRes.error || !detailRes.data) notFound()

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px' }}>
      <RfqDetailClient
        detail={detailRes.data}
        hasExistingBid={!!bidRes.data}
      />
    </main>
  )
}
