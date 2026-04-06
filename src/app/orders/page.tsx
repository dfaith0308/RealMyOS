import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'
import { formatKRW } from '@/lib/calc'

export const metadata = { title: '주문 목록 — RealMyOS' }

// ── 데이터 조회 ───────────────────────────────────────────────

async function getOrders() {
  const supabase = await createSupabaseServer()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      order_date,
      total_amount,
      total_supply_price,
      total_vat_amount,
      status,
      memo,
      customers ( name )
    `)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return []
  return data ?? []
}

// ── 페이지 ───────────────────────────────────────────────────

export default async function OrdersPage() {
  const orders = await getOrders()

  return (
    <main style={s.page}>
      {/* 헤더 */}
      <div style={s.header}>
        <h1 style={s.title}>주문 목록</h1>
        <Link href="/orders/new" style={s.newBtn}>
          + 주문 등록
        </Link>
      </div>

      {/* 빈 상태 */}
      {orders.length === 0 && (
        <div style={s.empty}>
          <p style={s.emptyText}>등록된 주문이 없습니다.</p>
          <Link href="/orders/new" style={s.emptyLink}>
            첫 주문 등록하기 →
          </Link>
        </div>
      )}

      {/* 주문 목록 */}
      {orders.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>주문번호</th>
                <th style={s.th}>거래처</th>
                <th style={s.th}>주문일</th>
                <th style={{ ...s.th, textAlign: 'right' }}>공급가</th>
                <th style={{ ...s.th, textAlign: 'right' }}>부가세</th>
                <th style={{ ...s.th, textAlign: 'right' }}>합계</th>
                <th style={s.th}>메모</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const customer = order.customers as { name: string } | null
                return (
                  <tr key={order.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.orderNum}>{order.order_number}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.customerName}>{customer?.name ?? '-'}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.date}>{order.order_date}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <span style={s.num}>{order.total_supply_price.toLocaleString()}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <span style={s.num}>{order.total_vat_amount.toLocaleString()}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <span style={s.totalNum}>{formatKRW(order.total_amount)}</span>
                    </td>
                    <td style={s.td}>
                      <span style={s.memo}>{order.memo ?? ''}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 하단 요약 */}
      {orders.length > 0 && (
        <div style={s.summary}>
          총 {orders.length}건 ·{' '}
          합계{' '}
          {formatKRW(orders.reduce((sum, o) => sum + o.total_amount, 0))}
        </div>
      )}
    </main>
  )
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 24px 60px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  newBtn: {
    padding: '9px 18px',
    background: '#111827',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 0',
    color: '#9ca3af',
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 12,
  },
  emptyLink: {
    color: '#6b7280',
    fontSize: 14,
    textDecoration: 'underline',
  },
  tableWrap: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 500,
    color: '#6b7280',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 14px',
    verticalAlign: 'middle',
  },
  orderNum: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#6b7280',
  },
  customerName: {
    fontWeight: 500,
    color: '#111827',
  },
  date: {
    color: '#6b7280',
    fontSize: 12,
  },
  num: {
    fontVariantNumeric: 'tabular-nums',
    color: '#374151',
  },
  totalNum: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    color: '#111827',
  },
  memo: {
    color: '#9ca3af',
    fontSize: 12,
  },
  summary: {
    marginTop: 16,
    textAlign: 'right',
    fontSize: 13,
    color: '#6b7280',
  },
}