import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCustomerSalesProfile, getConversionStats } from '@/actions/sales'
import {
  getCustomerDetail,
  getCustomerFinanceSummary,
  getCustomerOrders,
  getCustomerPayments,
} from '@/actions/customer-query'
import CustomerSalesClient from './CustomerSalesClient'
import { CustomerTagsSectionClient } from '@/components/customer/CustomerTagsSectionClient'
import CustomerDetailClient from '@/components/customer/CustomerDetailClient'

export const metadata = { title: '거래처 상세 — RealMyOS' }

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const id = params.id

  const [detailRes, financeRes, ordersRes, paymentsRes, salesRes, convResult] = await Promise.all([
    getCustomerDetail(id),
    getCustomerFinanceSummary(id),
    getCustomerOrders(id, 10),
    getCustomerPayments(id, 10),
    getCustomerSalesProfile(id),
    getConversionStats(id),
  ])

  if (!detailRes.success || !detailRes.data) notFound()
  if (!salesRes.success || !salesRes.data) notFound()

  const customer = detailRes.data
  const { history, next_action, customer: salesCustomer } = salesRes.data

  const finance = financeRes.success && financeRes.data
    ? financeRes.data
    : {
        receivable: 0,
        month_sales: 0,
        lifetime_sales: 0,
        last_payment_date: null,
        days_since_last_payment: null,
      }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 48px', background: '#f7f6f2', minHeight: '100vh' }}>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 14 }}>
        <Link href="/customers" style={{ color: '#6b7280', textDecoration: 'none' }}>
          거래처
        </Link>
        {' / '}
        <span style={{ color: '#2b2b2b' }}>{customer.name}</span>
        {' · '}
        <Link href={`/customers/${id}/ledger`} style={{ color: '#2563EB', textDecoration: 'none' }}>
          원장
        </Link>
      </div>

      <CustomerDetailClient
        customer={{
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          representative_name: customer.representative_name,
        }}
        finance={finance}
        orders={ordersRes.success ? ordersRes.data ?? [] : []}
        payments={paymentsRes.success ? paymentsRes.data ?? [] : []}
      />

      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <CustomerTagsSectionClient customerId={customer.id} />
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '18px 20px',
        }}
      >
        <CustomerSalesClient
          customer={salesCustomer}
          initialHistory={history}
          nextAction={next_action}
          conversionStats={convResult.data ?? null}
          historyOnly
        />
      </div>
    </div>
  )
}
