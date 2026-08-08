import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import {
  getLedgerCustomers,
  getLedgerSuppliers,
  getLedgerTaxInvoiceSummaries,
} from '@/actions/ledger'
import LedgerHubClient from '@/components/ledger/LedgerHubClient'

export const metadata = { title: '원장관리 — RealMyOS' }

type LedgerKind = 'sales' | 'purchases'
type PaymentMethodFilter = '' | 'transfer' | 'cash' | 'card'

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: {
    kind?: string
    from?: string
    to?: string
    supplier?: string
    payment_method?: string
  }
}) {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const now = new Date(Date.now() + 9 * 3600000)
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`

  const kindParam: LedgerKind = searchParams.kind === 'purchases' ? 'purchases' : 'sales'
  const from = searchParams.from ?? monthStart
  const to = searchParams.to ?? today
  const supplier = searchParams.supplier ?? ''

  const rawMethod = searchParams.payment_method
  const paymentMethod: PaymentMethodFilter =
    rawMethod === undefined
      ? 'transfer'
      : rawMethod === 'transfer' ||
          rawMethod === 'cash' ||
          rawMethod === 'card' ||
          rawMethod === ''
        ? rawMethod
        : 'transfer'

  const [customersResult, suppliersResult, taxResult] = await Promise.all([
    getLedgerCustomers(),
    getLedgerSuppliers(),
    getLedgerTaxInvoiceSummaries({
      from,
      to,
      payment_method: paymentMethod || undefined,
    }),
  ])

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>원장관리</h1>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
          매출원장 · 매입원장 진입점 (상세는 거래처 원장으로 이동, 매입원장 상세는 후속 단계)
        </p>
      </div>

      {!customersResult.success ? (
        <p style={{ color: '#B91C1C', fontSize: 14 }}>{customersResult.error}</p>
      ) : (
        <LedgerHubClient
          initialKind={kindParam}
          initialFrom={from}
          initialTo={to}
          initialSupplier={supplier}
          initialPaymentMethod={paymentMethod}
          initialTaxRows={taxResult.success ? (taxResult.data ?? []) : []}
          customers={customersResult.data ?? []}
          suppliers={suppliersResult.success ? (suppliersResult.data ?? []) : []}
        />
      )}
    </main>
  )
}
