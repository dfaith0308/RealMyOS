import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getCustomerOpenOrdersForAllocation,
  getPaymentAllocations,
  getPaymentDetail,
} from '@/actions/payment'
import PaymentAllocationClient from '@/components/payment/PaymentAllocationClient'
import PaymentEditForm from '@/components/payment/PaymentEditForm'
import { Surface } from '@/components/ui/Surface'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { DSStatus } from '@/styles/design-system'

export const metadata = { title: '수금 상세 — RealMyOS' }

const METHOD_LABEL: Record<string, string> = {
  transfer: '무통장',
  cash: '현금',
  card: '카드',
  platform: '플랫폼',
}

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const paymentRes = await getPaymentDetail(params.id)
  if (!paymentRes.success || !paymentRes.data) notFound()

  const [allocRes, openRes] = await Promise.all([
    getPaymentAllocations(paymentRes.data.id),
    getCustomerOpenOrdersForAllocation(paymentRes.data.customer_id),
  ])

  const payment = paymentRes.data
  const allocations = allocRes.data ?? []
  const openOrders = openRes.data ?? []
  const badgeStatus: DSStatus = payment.status === 'confirmed' ? 'confirmed' : 'cancelled'
  const allocatedSum = allocations
    .filter((a) => a.status === 'active')
    .reduce((s, a) => s + a.allocated_amount, 0)

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ds-text-muted)', marginBottom: 6 }}>
            <Link href="/payments" style={{ color: 'var(--ds-text-muted)', textDecoration: 'none' }}>수금</Link>
            {' / '}
            <span>상세</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>
              {payment.customer_name}
            </div>
            <StatusBadge
              status={badgeStatus}
              title={payment.status}
            />
          </div>
        </div>

        <Link
          href={`/customers/${payment.customer_id}/ledger`}
          style={{ fontSize: 12, fontWeight: 900, color: 'var(--ds-brand-primary)', textDecoration: 'none' }}
        >
          원장 보기 →
        </Link>
      </div>

      <Surface variant="panel" density="comfortable">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {[
            { k: '수금일', v: payment.payment_date },
            { k: '방식', v: METHOD_LABEL[payment.payment_method] ?? payment.payment_method },
            { k: '수금액', v: payment.amount.toLocaleString() + '원' },
            { k: '예치금', v: (payment.deposit_amount ?? 0).toLocaleString() + '원' },
          ].map((x) => (
            <div key={x.k} style={{ border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '12px 14px', background: 'var(--ds-surface-panel)' }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--ds-text-muted)' }}>{x.k}</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900, color: 'var(--ds-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {x.v}
              </div>
            </div>
          ))}
        </div>
        {payment.memo ? (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--ds-text-muted)', whiteSpace: 'pre-wrap' }}>
            메모: {payment.memo}
          </div>
        ) : null}
      </Surface>

      <div style={{ marginTop: 12 }}>
        <PaymentEditForm payment={payment} allocatedSum={allocatedSum} />
      </div>

      <div style={{ marginTop: 12 }}>
        <PaymentAllocationClient payment={payment} allocations={allocations} openOrders={openOrders} />
      </div>
    </main>
  )
}

