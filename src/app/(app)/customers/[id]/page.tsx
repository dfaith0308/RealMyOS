import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCustomerSalesProfile, getConversionStats } from '@/actions/sales'
import CustomerSalesClient from './CustomerSalesClient'

export const metadata = { title: '거래처 상세 — RealMyOS' }

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const [result, convResult] = await Promise.all([
    getCustomerSalesProfile(params.id),
    getConversionStats(params.id),
  ])
  if (!result.success || !result.data) notFound()

  const { customer, history, next_action } = result.data

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      {/* 브레드크럼 */}
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
        <Link href="/customers" style={{ color: '#6b7280', textDecoration: 'none' }}>거래처</Link>
        {' / '}
        <span>{customer.name}</span>
      </div>

      <CustomerSalesClient
        customer={customer}
        initialHistory={history}
        nextAction={next_action}
        conversionStats={convResult.data ?? null}
      />
    </div>
  )
}
