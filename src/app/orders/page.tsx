import Link from 'next/link'
import { getOrderList } from '@/actions/order-query'
import { formatKRW } from '@/lib/calc'

export const metadata = { title: '주문 목록 — RealMyOS' }

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: '임시저장', color: '#6b7280', bg: '#F3F4F6' },
  confirmed: { label: '확정',    color: '#1D4ED8', bg: '#EFF6FF' },
  cancelled: { label: '취소',    color: '#B91C1C', bg: '#FEF2F2' },
}

export default async function OrdersPage() {
  const result = await getOrderList()
  const orders = result.data ?? []

  const confirmed = orders.filter((o) => o.status === 'confirmed')
  const draft     = orders.filter((o) => o.status === 'draft')

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>주문 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            확정 {confirmed.length}건 · 임시 {draft.length}건
          </p>
        </div>
        <Link href="/orders/new" style={s.newBtn}>+ 주문 등록</Link>
      </div>

      {orders.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 주문이 없습니다.</p>
      )}

      {orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={th}>주문번호</th>
              <th style={th}>거래처</th>
              <th style={th}>주문일</th>
              <th style={{ ...th, textAlign: 'right' }}>금액</th>
              <th style={th}>상태</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const cfg = STATUS_CFG[o.status] ?? STATUS_CFG.confirmed
              return (
                <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>
                    {o.order_number}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{o.customer_name}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{o.order_date}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatKRW(o.total_amount)}
                  </td>
                  <td style={td}>
                    <span style={{ ...s.badge, color: cfg.color, background: cfg.bg }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td style={td}>
                    <Link href={`/orders/new?customer_id=reorder_${o.customer_id}`} style={s.reorderBtn}>
                      재주문
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left',
  fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb',
}
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  newBtn:     { padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  badge:      { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  reorderBtn: { padding: '4px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#1D4ED8', textDecoration: 'none' },
}
