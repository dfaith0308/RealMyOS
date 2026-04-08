'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrder, cancelOrder } from '@/actions/order'
import { calcLine, formatKRW, todayStr } from '@/lib/calc'

interface OrderLine {
  id: string
  product_id: string
  product_code: string
  product_name: string
  unit_price: number
  cost_price: number
  tax_type: 'taxable' | 'exempt'
  fulfillment_type: 'stock' | 'consignment'
  quantity: number
  supply_price: number
  vat_amount: number
  line_total: number
}

interface OrderData {
  id: string
  order_number: string
  order_date: string
  status: string
  memo: string | null
  created_at: string
  total_supply_price: number
  total_vat_amount: number
  total_amount: number
  customers: { id: string; name: string } | null
  order_lines: OrderLine[]
}

interface Props {
  order: OrderData
  isLocked: boolean
  lockDays: number
  diffDays: number
}

export default function OrderEditForm({ order, isLocked, lockDays, diffDays }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [orderDate, setOrderDate] = useState(order.order_date)
  const [memo, setMemo] = useState(order.memo ?? '')
  const [lines, setLines] = useState<OrderLine[]>(order.order_lines)

  const totals = lines.reduce(
    (s, l) => {
      const c = calcLine(l.unit_price, l.quantity, l.tax_type)
      return {
        supply: s.supply + c.supply_price,
        vat: s.vat + c.vat_amount,
        total: s.total + c.line_total,
      }
    },
    { supply: 0, vat: 0, total: 0 }
  )

  function updateLine(id: string, field: 'quantity' | 'unit_price', value: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const updated = { ...l, [field]: value }
        const c = calcLine(updated.unit_price, updated.quantity, updated.tax_type)
        return { ...updated, supply_price: c.supply_price, vat_amount: c.vat_amount, line_total: c.line_total }
      })
    )
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function handleSave() {
    setError(null)
    if (lines.length === 0) { setError('상품을 1개 이상 포함해야 합니다.'); return }
    startTransition(async () => {
      const r = await updateOrder({
        order_id: order.id,
        order_date: orderDate,
        memo,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          product_code: l.product_code,
          product_name: l.product_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          cost_price: l.cost_price,
          tax_type: l.tax_type,
          fulfillment_type: l.fulfillment_type,
        })),
      })
      if (r.success) { setSuccess(true); setTimeout(() => router.push('/orders'), 800) }
      else setError(r.error ?? '수정 실패')
    })
  }

  function handleCancel() {
    startTransition(async () => {
      const r = await cancelOrder(order.id, cancelReason || undefined)
      if (r.success) { router.push('/orders') }
      else setError(r.error ?? '취소 실패')
    })
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>주문 수정</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
            {order.order_number} · {order.customers?.name ?? '-'}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {isLocked && order.status !== 'cancelled' && (
        <div style={s.lockBanner}>
          🔒 주문 수정 가능 기간이 지나 수정할 수 없습니다. ({diffDays}일 경과 / 기준 {lockDays}일)
        </div>
      )}
      {order.status === 'cancelled' && (
        <div style={{ ...s.lockBanner, background: '#FEF2F2', borderColor: '#FCA5A5', color: '#B91C1C' }}>
          취소된 주문입니다.
        </div>
      )}

      {error && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>저장됐습니다.</div>}

      <div style={s.form}>
        <F label="주문일">
          <input style={s.input} type="date" value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)} disabled={isLocked} />
        </F>

        {/* 라인 테이블 */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 }}>
            주문 상품
          </label>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>상품명</th>
                <th style={{ ...th, textAlign: 'right' }}>수량</th>
                <th style={{ ...th, textAlign: 'right' }}>단가</th>
                <th style={{ ...th, textAlign: 'right' }}>금액</th>
                {!isLocked && <th style={th}></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{l.product_name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{l.product_code} · {l.tax_type === 'exempt' ? '면세' : '과세'}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {isLocked ? l.quantity : (
                      <input type="number" style={s.numInput} value={l.quantity} min={-999} max={9999}
                        onChange={(e) => updateLine(l.id, 'quantity', Number(e.target.value))} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {isLocked ? formatKRW(l.unit_price) : (
                      <input type="number" style={s.numInput} value={l.unit_price} min={0}
                        onChange={(e) => updateLine(l.id, 'unit_price', Number(e.target.value))} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatKRW(l.line_total)}
                  </td>
                  {!isLocked && (
                    <td style={td}>
                      <button type="button" style={s.removeBtn} onClick={() => removeLine(l.id)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td colSpan={2} style={{ ...td, fontSize: 11, color: '#6b7280' }}>
                  공급가 {formatKRW(totals.supply)} · 부가세 {formatKRW(totals.vat)}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>합계</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatKRW(totals.total)}
                </td>
                {!isLocked && <td />}
              </tr>
            </tfoot>
          </table>
        </div>

        <F label="메모">
          <textarea style={{ ...s.input, height: 72, resize: 'vertical' }} value={memo}
            onChange={(e) => setMemo(e.target.value)} disabled={isLocked} />
        </F>

        {/* 버튼 */}
        {!isLocked && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={s.cancelBtn} onClick={() => router.push('/orders')}>돌아가기</button>
            <button type="button" style={isPending ? s.submitOff : s.submit}
              onClick={handleSave} disabled={isPending}>
              {isPending ? '저장 중...' : '수정 저장'}
            </button>
          </div>
        )}

        {/* 취소 */}
        {order.status !== 'cancelled' && (
          <div style={{ marginTop: 8 }}>
            {!showCancelConfirm ? (
              <button type="button" style={s.dangerBtn}
                onClick={() => setShowCancelConfirm(true)}>
                주문 취소
              </button>
            ) : (
              <div style={s.cancelBox}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#B91C1C', margin: '0 0 8px 0' }}>
                  정말 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                <input style={s.input} value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="취소 사유 (선택)" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" style={s.cancelBtn}
                    onClick={() => setShowCancelConfirm(false)}>아니오</button>
                  <button type="button" style={isPending ? s.submitOff : s.confirmCancelBtn}
                    onClick={handleCancel} disabled={isPending}>
                    {isPending ? '처리 중...' : '네, 취소합니다'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    draft:     { label: '임시저장', color: '#6b7280', bg: '#F3F4F6' },
    confirmed: { label: '확정',    color: '#1D4ED8', bg: '#EFF6FF' },
    cancelled: { label: '취소',    color: '#B91C1C', bg: '#FEF2F2' },
  }
  const c = cfg[status] ?? cfg.confirmed
  return (
    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: c.color, background: c.bg }}>
      {c.label}
    </span>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

const th: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280' }
const td: React.CSSProperties = { padding: '9px 10px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  wrap:             { maxWidth: 720, margin: '0 auto', padding: '32px 24px 60px' },
  header:           { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  title:            { fontSize: 18, fontWeight: 600, margin: 0 },
  lockBanner:       { background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B45309', marginBottom: 16 },
  err:              { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  ok:               { background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:             { display: 'flex', flexDirection: 'column', gap: 16 },
  input:            { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  numInput:         { padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, width: 72, textAlign: 'right' },
  removeBtn:        { background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 14, padding: '2px 6px' },
  cancelBtn:        { flex: 1, padding: '11px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  submit:           { flex: 2, padding: '11px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  submitOff:        { flex: 2, padding: '11px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'not-allowed' },
  dangerBtn:        { padding: '8px 16px', background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  cancelBox:        { background: '#FFF1F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: 16 },
  confirmCancelBtn: { flex: 2, padding: '11px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
}
