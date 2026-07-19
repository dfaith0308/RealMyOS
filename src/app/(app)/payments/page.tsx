import { getPaymentList } from '@/actions/payment'
import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import PaymentsClient from '@/components/payment/PaymentsClient'
import Link from 'next/link'

export const metadata = { title: '수금 목록 — RealMyOS' }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; customer_id?: string; status?: string; period?: string }
}) {
  const now = new Date(Date.now() + 9 * 3600000)
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const periodAll = searchParams.period === 'all' && !searchParams.from && !searchParams.to
  const periodRange = searchParams.period === 'range'
  const from = periodAll ? '' : (searchParams.from ?? monthStart)
  const to = periodAll ? '' : (searchParams.to ?? today)
  const customer_id = searchParams.customer_id ?? ''
  const status = searchParams.status ?? 'confirmed'
  const period = periodAll ? 'all' : periodRange ? 'range' : (searchParams.period ?? '')

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [paymentsResult, { data: customers }] = await Promise.all([
    getPaymentList({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      customer_id: customer_id || undefined,
      status: status || undefined,
    }),
    supabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_buyer', true)
      .is('deleted_at', null)
      .order('name'),
  ])

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>수금 목록</h1>
          <p style={{ fontSize: 12, color: 'var(--text-hint)', margin: '4px 0 0 0' }}>
            {paymentsResult.data?.length ?? 0}건
          </p>
        </div>
        <Link
          href="/payments/new"
          style={{
            padding: '8px 16px',
            background: 'var(--color-primary)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + 수금 등록
        </Link>
      </div>

      <PaymentsClient
        payments={paymentsResult.data ?? []}
        customers={customers ?? []}
        filters={{ from, to, customer_id, status, period }}
      />
    </main>
  )
}
