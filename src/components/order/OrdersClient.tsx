'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cancelOrder } from '@/actions/order'
import { formatKRW } from '@/lib/calc'
import type { OrderListItem } from '@/actions/order-query'

interface Filters { from: string; to: string; status: string; customer_id: string }
interface Customer { id: string; name: string }

interface Props {
  orders: OrderListItem[]
  customers: Customer[]
  filters: Filters
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: '임시저장', color: '#6b7280', bg: '#F3F4F6' },
  confirmed: { label: '확정',    color: '#1D4ED8', bg: '#EFF6FF' },
  cancelled: { label: '취소',    color: '#B91C1C', bg: '#FEF2F2' },
}

export default function OrdersClient({ orders, customers, filters }: Props) {
  const router   = useRouter()
  const [expandedId, setExpandedId]             = useState<string | null>(null)
  const [cancelTarget, setCancelTarget]         = useState<OrderListItem | null>(null)
  const [cancelReason, setCancelReason]         = useState('')
  const [isPending, startTransition]            = useTransition()
  const [localFilters, setLocalFilters]         = useState(filters)

  const confirmed = orders.filter((o) => o.status === 'confirmed')
  const totalAmt  = confirmed.reduce((s, o) => s + o.total_amount, 0)

  function applyFilters() {
    const params = new URLSearchParams()
    if (localFilters.from)        params.set('from',        localFilters.from)
    if (localFilters.to)          params.set('to',          localFilters.to)
    if (localFilters.status)      params.set('status',      localFilters.status)
    if (localFilters.customer_id) params.set('customer_id', localFilters.customer_id)
    router.push(`/orders?${params.toString()}`)
  }

  function handleCancel() {
    if (!cancelTarget) return
    startTransition(async () => {
      await cancelOrder(cancelTarget.id, cancelReason || undefined)
      setCancelTarget(null)
      setCancelReason('')
      router.refresh()
    })
  }

  // 거래내역 요약 (order_lines 기준)
  function summarizeLines(lines: OrderListItem['order_lines']): string {
    if (!lines.length) return '-'
    if (lines.length === 1) return `${lines[0].product_name} ${lines[0].quantity}개`
    return `${lines[0].product_name} 외 ${lines.length - 1}건`
  }

  return (
    <>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>주문 목록</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            확정 {confirmed.length}건 · 합계 {formatKRW(totalAmt)}
          </p>
        </div>
        <Link href="/orders/new" style={s.newBtn}>+ 주문 등록</Link>
      </div>

      {/* 필터 */}
      <div style={s.filterRow}>
        <input type="date" value={localFilters.from} style={s.input}
          onChange={(e) => setLocalFilters((p) => ({ ...p, from: e.target.value }))} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
        <input type="date" value={localFilters.to} style={s.input}
          onChange={(e) => setLocalFilters((p) => ({ ...p, to: e.target.value }))} />
        <select value={localFilters.customer_id} style={s.select}
          onChange={(e) => setLocalFilters((p) => ({ ...p, customer_id: e.target.value }))}>
          <option value="">전체 거래처</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={localFilters.status} style={s.select}
          onChange={(e) => setLocalFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="">전체 상태</option>
          <option value="confirmed">확정</option>
          <option value="draft">임시저장</option>
          <option value="cancelled">취소</option>
        </select>
        <button style={s.searchBtn} onClick={applyFilters}>검색</button>
        <button style={s.resetBtn} onClick={() => router.push('/orders')}>초기화</button>
      </div>

      {orders.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>주문이 없습니다.</p>
      )}

      {orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <th style={th}>주문일</th>
              <th style={th}>거래처</th>
              <th style={th}>거래내역</th>
              <th style={{ ...th, textAlign: 'right' }}>금액</th>
              <th style={{ ...th, textAlign: 'right' }}>잔액</th>
              <th style={th}>상태</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const cfg     = STATUS_CFG[o.status] ?? STATUS_CFG.confirmed
              const expanded = expandedId === o.id

              return (
                <>
                  <tr key={o.id}
                    style={{ borderBottom: expanded ? 'none' : '1px solid #f3f4f6', cursor: 'pointer' }}
                    onDoubleClick={() => setExpandedId(expanded ? null : o.id)}>
                    <td style={{ ...td, color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>
                      {o.order_date}
                      <div style={{ fontSize: 10, color: '#d1d5db' }}>{o.order_number}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{o.customer_name}</td>
                    <td style={td}>
                      <span
                        style={{ cursor: 'pointer', color: '#374151' }}
                        onClick={() => setExpandedId(expanded ? null : o.id)}
                        title="클릭하여 상세 품목 펼치기">
                        {summarizeLines(o.order_lines)}
                        {o.order_lines.length > 1 && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: '#9ca3af' }}>
                            {expanded ? '▲' : '▼'}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                      {formatKRW(o.total_amount)}
                    </td>
                    <td style={{
                      ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      fontSize: 12,
                      color: o.current_balance === null ? '#d1d5db'
                           : o.current_balance > 0 ? '#B91C1C'
                           : o.current_balance < 0 ? '#1D4ED8'
                           : '#6b7280',
                      fontWeight: o.current_balance && o.current_balance !== 0 ? 600 : 400,
                    }}>
                      {o.current_balance === null ? '-'
                        : o.current_balance < 0 ? `예치 ${formatKRW(Math.abs(o.current_balance))}`
                        : formatKRW(o.current_balance)}
                    </td>
                    <td style={td}>
                      <span style={{ ...s.badge, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                    </td>
                    <td style={{ ...td, display: 'flex', gap: 4, alignItems: 'center' }}>
                      {o.status !== 'cancelled' && (
                        <>
                          <Link href={`/orders/${o.id}/edit`} style={s.editBtn}>수정</Link>
                          <button style={s.cancelBtn}
                            onClick={(e) => { e.stopPropagation(); setCancelTarget(o) }}>
                            취소
                          </button>
                        </>
                      )}
                      <Link href={`/orders/new?customer_id=reorder_${o.customer_id}`} style={s.reorderBtn}>
                        재주문
                      </Link>
                    </td>
                  </tr>

                  {/* 상세 품목 펼침 */}
                  {expanded && (
                    <tr key={`${o.id}-detail`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td colSpan={6} style={{ padding: '0 12px 10px 12px', background: '#f9fafb' }}>
                        <table style={{ width: '100%', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: '#9ca3af' }}>
                              <th style={{ ...th, fontSize: 10, padding: '4px 8px' }}>상품명</th>
                              <th style={{ ...th, fontSize: 10, padding: '4px 8px', textAlign: 'right' }}>수량</th>
                              <th style={{ ...th, fontSize: 10, padding: '4px 8px', textAlign: 'right' }}>단가</th>
                              <th style={{ ...th, fontSize: 10, padding: '4px 8px', textAlign: 'right' }}>금액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.order_lines.map((l, i) => (
                              <tr key={i}>
                                <td style={{ padding: '4px 8px' }}>{l.product_name}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{l.quantity}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatKRW(l.unit_price)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatKRW(l.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      )}

      {/* 취소 확인 모달 */}
      {cancelTarget && (
        <div style={s.overlay} onClick={() => setCancelTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <p style={s.modalTitle}>주문 취소</p>
            <p style={s.modalDesc}>
              [{cancelTarget.order_number}] {cancelTarget.customer_name}<br />
              {formatKRW(cancelTarget.total_amount)} — 정말 취소하시겠습니까?
            </p>
            <input style={s.modalInput} value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="취소 사유 (선택)" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={s.modalCancelBtn} onClick={() => setCancelTarget(null)}>아니오</button>
              <button style={isPending ? s.modalConfirmOff : s.modalConfirmBtn}
                onClick={handleCancel} disabled={isPending}>
                {isPending ? '처리 중...' : '네, 취소합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' as const }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  newBtn:         { padding: '8px 16px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' },
  filterRow:      { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input:          { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:         { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn:      { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:       { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  badge:          { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  editBtn:        { padding: '4px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, color: '#374151', textDecoration: 'none' },
  cancelBtn:      { padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', cursor: 'pointer' },
  reorderBtn:     { padding: '4px 8px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, color: '#1D4ED8', textDecoration: 'none' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:          { background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle:     { fontSize: 16, fontWeight: 600, margin: '0 0 8px 0', color: '#B91C1C' },
  modalDesc:      { fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 12px 0' },
  modalInput:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' },
  modalCancelBtn: { flex: 1, padding: '10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  modalConfirmBtn:{ flex: 2, padding: '10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  modalConfirmOff:{ flex: 2, padding: '10px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
}