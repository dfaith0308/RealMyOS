import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import PurchaseCreateClient from '@/components/purchases/PurchaseCreateClient'
import Link from 'next/link'

export const metadata = { title: '매입 등록 — RealMyOS' }

export default async function PurchaseNewPage() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/purchases" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← 매입 목록</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 0 0' }}>매입 등록</h1>
      </div>
      <PurchaseCreateClient />
    </main>
  )
}
