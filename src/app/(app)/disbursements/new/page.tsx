import { getUnpaidPurchases } from '@/actions/purchase'
import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import DisbursementCreateClient from '@/components/disbursements/DisbursementCreateClient'
import Link from 'next/link'

export const metadata = { title: '지급 등록 — RealMyOS' }

export default async function DisbursementNewPage() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const unpaidResult = await getUnpaidPurchases()

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/disbursements" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← 지급 목록</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0 0' }}>지급 등록 · 분배</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
          미지급·부분 매입에 금액을 나누어 저장합니다 (RPC 원자 처리).
        </p>
      </div>

      {!unpaidResult.success ? (
        <p style={{ color: '#B91C1C', fontSize: 14 }}>{unpaidResult.error}</p>
      ) : (
        <DisbursementCreateClient unpaidPurchases={unpaidResult.data ?? []} />
      )}
    </main>
  )
}
