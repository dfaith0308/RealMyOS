'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatKRW } from '@/lib/calc'
import type {
  CustomerFinanceSummary,
  CustomerOrderRowItem,
  CustomerPaymentRowItem,
} from '@/actions/customer-query'
import { cancelOrder } from '@/actions/order'
import { cancelPayment } from '@/actions/payment'
import SmsModal from '@/components/sms/SmsModal'
import CustomerOrderModal from '@/components/customer/CustomerOrderModal'
import CustomerPaymentModal from '@/components/customer/CustomerPaymentModal'

const METHOD_LABEL: Record<string, string> = {
  transfer: '무통장',
  cash: '현금',
  card: '카드',
  platform: '플랫폼',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  confirmed: '확정',
  draft: '임시',
  cancelled: '취소',
}

function initials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t.slice(0, 1)
}

export default function CustomerDetailClient({
  customer,
  finance,
  orders,
  payments,
}: {
  customer: {
    id: string
    name: string
    phone: string | null
    address: string | null
    representative_name: string | null
  }
  finance: CustomerFinanceSummary
  orders: CustomerOrderRowItem[]
  payments: CustomerPaymentRowItem[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showOrder, setShowOrder] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showSms, setShowSms] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = finance.days_since_last_payment
  const lastPayLabel =
    days === null ? '없음' : days === 0 ? '오늘' : `${days}일 전`
  const lastPayWarn = days !== null && days >= 61

  function refresh() {
    router.refresh()
  }

  function handleCancelOrder(id: string) {
    if (!confirm('이 주문을 취소하시겠습니까?')) return
    setError(null)
    start(async () => {
      const r = await cancelOrder(id)
      if (!r.success) {
        setError(r.error ?? '주문 취소 실패')
        return
      }
      refresh()
    })
  }

  function handleCancelPayment(id: string) {
    if (!confirm('이 수금을 취소하시겠습니까?')) return
    setError(null)
    start(async () => {
      const r = await cancelPayment(id)
      if (!r.success) {
        setError(r.error ?? '수금 취소 실패')
        return
      }
      refresh()
    })
  }

  return (
    <>
      <div style={cardPad}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
            <div style={avatar}>{initials(customer.name)}</div>
            <div style={{ minWidth: 0 }}>
              <h1 style={title}>{customer.name}</h1>
              <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {customer.phone ? <span>{customer.phone}</span> : <span>연락처 없음</span>}
                {customer.address ? <span>· {customer.address}</span> : null}
                {customer.representative_name ? <span>· {customer.representative_name}</span> : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/customers/${customer.id}/edit`} style={btnGhost}>
              수정
            </Link>
            <button type="button" onClick={() => setShowOrder(true)} style={btnGreen}>
              + 주문 등록
            </button>
            <button type="button" onClick={() => setShowPayment(true)} style={btnOrange}>
              + 수금 등록
            </button>
            <button
              type="button"
              onClick={() => setShowSms(true)}
              disabled={!customer.phone}
              style={{
                ...btnKakao,
                opacity: customer.phone ? 1 : 0.45,
                cursor: customer.phone ? 'pointer' : 'not-allowed',
              }}
            >
              문자
            </button>
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} style={btnPhone}>
                전화
              </a>
            ) : (
              <span style={{ ...btnPhone, opacity: 0.45, cursor: 'not-allowed' }}>전화</span>
            )}
          </div>
        </div>
      </div>

      {error ? <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p> : null}

      <div style={kpiGrid}>
        <KpiCard label="미수금" value={formatKRW(finance.receivable)} valueColor="#dc2626" />
        <KpiCard label="이번달 매출" value={formatKRW(finance.month_sales)} />
        <KpiCard
          label="마지막 수금"
          value={lastPayLabel}
          valueColor={lastPayWarn ? '#d97706' : undefined}
          hint={finance.last_payment_date ?? undefined}
        />
        <KpiCard label="총 거래금액" value={formatKRW(finance.lifetime_sales)} />
      </div>

      <div style={colsGrid}>
        <section style={historyCard}>
          <div style={historyHead}>
            <h2 style={sectionTitle}>주문이력</h2>
            <Link href={`/orders?customer_id=${customer.id}`} style={allLink}>
              전체보기 →
            </Link>
          </div>
          {orders.length === 0 ? (
            <Empty text="주문 내역이 없습니다" />
          ) : (
            orders.map((o) => (
              <div key={o.id} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={rowTop}>
                    <span style={muted}>{o.order_date}</span>
                    <span style={amount}>{formatKRW(o.total_amount)}</span>
                  </div>
                  <div style={ellipsis}>{o.product_summary}</div>
                  <div style={{ ...muted, marginTop: 2 }}>
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    {o.order_number ? ` · ${o.order_number}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Link href={`/orders/${o.id}/edit`} style={miniBtn}>
                    수정
                  </Link>
                  <button
                    type="button"
                    disabled={pending || o.status === 'cancelled'}
                    onClick={() => handleCancelOrder(o.id)}
                    style={miniDanger}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        <section style={historyCard}>
          <div style={historyHead}>
            <h2 style={sectionTitle}>수금이력</h2>
            <Link href={`/payments?customer_id=${customer.id}`} style={allLink}>
              전체보기 →
            </Link>
          </div>
          {payments.length === 0 ? (
            <Empty text="수금 내역이 없습니다" />
          ) : (
            payments.map((p) => (
              <div key={p.id} style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={rowTop}>
                    <span style={muted}>{p.payment_date}</span>
                    <span style={amount}>{formatKRW(p.amount)}</span>
                  </div>
                  <div style={ellipsis}>
                    {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                    {p.status === 'reversed' ? ' · 취소됨' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Link href={`/payments/${p.id}`} style={miniBtn}>
                    수정
                  </Link>
                  <button
                    type="button"
                    disabled={pending || p.status === 'reversed'}
                    onClick={() => handleCancelPayment(p.id)}
                    style={miniDanger}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {showOrder ? (
        <CustomerOrderModal
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setShowOrder(false)}
          onDone={refresh}
        />
      ) : null}

      {showPayment ? (
        <CustomerPaymentModal
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setShowPayment(false)}
          onDone={refresh}
        />
      ) : null}

      {showSms && customer.phone ? (
        <SmsModal
          customers={[{ id: customer.id, name: customer.name, phone: customer.phone }]}
          onClose={() => setShowSms(false)}
          onDone={() => {
            setShowSms(false)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}

function KpiCard({
  label,
  value,
  valueColor,
  hint,
}: {
  label: string
  value: string
  valueColor?: string
  hint?: string
}) {
  return (
    <div style={kpiCard}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: valueColor ?? '#2b2b2b',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{hint}</div> : null}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '28px 0' }}>{text}</div>
  )
}

const cardPad: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '18px 20px',
  marginBottom: 16,
}

const avatar: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  background: '#1f5d3a',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  fontWeight: 700,
  flexShrink: 0,
}

const title: CSSProperties = {
  margin: '0 0 4px',
  fontSize: 20,
  fontWeight: 700,
  color: '#2b2b2b',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const kpiGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
  marginBottom: 16,
}

const kpiCard: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '14px 16px',
}

const colsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
  marginBottom: 20,
}

const historyCard: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  minHeight: 200,
}

const historyHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
}

const sectionTitle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700, color: '#2b2b2b' }
const allLink: CSSProperties = { fontSize: 12, color: '#2563EB', textDecoration: 'none', fontWeight: 600 }

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: 'none',
  whiteSpace: 'nowrap',
}

const btnGhost: CSSProperties = { ...btnBase, background: '#fff', border: '1px solid #e5e7eb', color: '#374151' }
const btnGreen: CSSProperties = { ...btnBase, background: '#1f5d3a', color: '#fff' }
const btnOrange: CSSProperties = { ...btnBase, background: '#E8701C', color: '#fff' }
const btnKakao: CSSProperties = { ...btnBase, background: '#FEE500', color: '#1a1a1a' }
const btnPhone: CSSProperties = { ...btnBase, background: '#fff', border: '1px solid #e5e7eb', color: '#374151' }

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '10px 0',
  borderBottom: '1px solid #f3f4f6',
}

const rowTop: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }
const muted: CSSProperties = { fontSize: 11, color: '#9ca3af' }
const amount: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#2b2b2b', flexShrink: 0 }
const ellipsis: CSSProperties = {
  fontSize: 13,
  color: '#374151',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const miniBtn: CSSProperties = {
  padding: '3px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
  fontSize: 11,
  color: '#2563EB',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const miniDanger: CSSProperties = {
  ...miniBtn,
  color: '#dc2626',
  borderColor: '#fecaca',
}
