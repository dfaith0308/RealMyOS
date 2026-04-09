import { getPaymentList } from '@/actions/payment'
import { createSupabaseServer } from '@/lib/supabase-server'
import PaymentsClient from '@/components/payment/PaymentsClient'
import Link from 'next/link'

export const metadata = { title: '수금 목록 — RealMyOS' }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; customer_id?: string; status?: string }
}) {
  const now        = new Date(Date.now() + 9 * 3600000)
  const today      = now.toISOString().slice(0, 10)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const from        = searchParams.from        ?? monthStart
  const to          = searchParams.to          ?? today
  const customer_id = searchParams.customer_id ?? ''
  const status      = searchParams.status      ?? 'confirmed'  // 기본: 정상 수금만


  const _t0 = Date.now()
  const [paymentsResult, { data: customers }] = await Promise.all([
    getPaymentList({ from, to, customer_id: customer_id || undefined, status: status || undefined }),
    createSupabaseServer().then((s) =>
      s.from('customers').select('id, name').eq('is_buyer', true).is('deleted_at', null).order('name')
    ),
  ])

  console.error(`[PERF] /payments: ${Date.now() - _t0}ms`)

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>수금 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            {paymentsResult.data?.length ?? 0}건
          </p>
        </div>
        <Link href="/payments/new"
          style={{ padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          + 수금 등록
        </Link>
      </div>

      <PaymentsClient
        payments={paymentsResult.data ?? []}
        customers={customers ?? []}
        filters={{ from, to, customer_id, status }}
      />
    </main>
  )
}
