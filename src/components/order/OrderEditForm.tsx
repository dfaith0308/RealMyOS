'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrder, cancelOrder } from '@/actions/order'
import { calcLine, formatKRW } from '@/lib/calc'

// ── 타입 ────────────────────────────────────────────────────

interface OrderLine {
  id:               string
  product_id:       string
  product_code:     string
  product_name:     string
  unit_price:       number
  cost_price:       number
  tax_type:         'taxable' | 'exempt'
  fulfillment_type: 'stock' | 'consignment'
  quantity:         number
  supply_price:     number
  vat_amount:       number
  line_total:       number
}

interface ProductOption {
  id:               string
  product_code:     string
  name:             string
  tax_type:         'taxable' | 'exempt'
  cost_price:       number
  selling_price:    number | null
}

interface OrderData {
  id:                 string
  order_number:       string
  order_date:         string
  status:             string
  memo:               string | null
  created_at:         string
  total_supply_price: number
  total_vat_amount:   number
  total_amount:       number
  customers:          { id: string; name: string } | null
  order_lines:        OrderLine[]
}

interface Props {
  order:    OrderData
  isLocked: boolean
  lockDays: number
  diffDays: number
  products: ProductOption[]   // 서버에서 미리 조회한 상품 목록
}

// ── 상품 검색 컴포넌트 ───────────────────────────────────────

function ProductSearchInput({
  products,
  onSelect,
  onClose,
}: {
  products:  ProductOption[]
  onSelect:  (p: ProductOption) => void
  onClose:   () => void
}) {
  const [q, setQ]         = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = q.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.product_code.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 10)
    : products.slice(0, 10)

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && filtered[cursor]) { onSelect(filtered[cursor]) }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, background: '#F8FAFF', padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          ref={inputRef}
          style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}
          placeholder="상품명 또는 코드 검색..."
          value={q}
          onChange={e => { setQ(e.target.value); setCursor(0) }}
          onKeyDown={handleKey}
        />
        <button onClick={onClose}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
          닫기
        </button>
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 4px' }}>검색 결과 없음</div>
        ) : filtered.map((p, idx) => (
          <button key={p.id} onClick={() => onSelect(p)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: 'none', borderRadius: 7, background: idx === cursor ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
            onMouseEnter={() => setCursor(idx)}
          >
            <span>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{p.product_code}</span>
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>{p.tax_type === 'exempt' ? '면세' : '과세'}</span>
            </span>
            <span style={{ fontSize: 12, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
              {formatKRW(p.selling_price ?? p.cost_price)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function OrderEditForm({ order, isLocked, lockDays, diffDays, products }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showSearch, setShowSearch]     = useState(false)

  const [orderDate, setOrderDate] = useState(order.order_date)
  const [memo, setMemo]           = useState(order.memo ?? '')
  const [lines, setLines]         = useState<OrderLine[]>(order.order_lines)

  // 합계 계산
  const totals = lines.reduce(
    (s, l) => {
      const c = calcLine(l.unit_price, l.quantity, l.tax_type)
      return { supply: s.supply + c.supply_price, vat: s.vat + c.vat_amount, total: s.total + c.line_total }
    },
    { supply: 0, vat: 0, total: 0 }
  )

  // ── 라인 조작 ───────────────────────────────────────────────

  function updateLine(id: string, field: 'quantity' | 'unit_price', value: number) {
    const safe = isNaN(value) ? 0 : value
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: safe }
      const c = calcLine(updated.unit_price, updated.quantity, updated.tax_type)
      return { ...updated, supply_price: c.supply_price, vat_amount: c.vat_amount, line_total: c.line_total }
    }))
  }

  // 수량 0 이하 → onBlur 시 라인 삭제 (최소 1개 유지)
  function handleQtyBlur(id: string, quantity: number) {
    if (quantity > 0) return
    if (lines.length <= 1) { updateLine(id, 'quantity', 1); return }  // 마지막 라인은 1로 복원
    setLines(prev => prev.filter(l => l.id !== id))
  }

  function removeLine(id: string) {
    if (lines.length <= 1) { setError('최소 1개 상품이 필요합니다.'); return }
    setLines(prev => prev.filter(l => l.id !== id))
  }

  function addProduct(p: ProductOption) {
    // 중복 상품 → 수량 +1
    const exists = lines.find(l => l.product_id === p.id)
    if (exists) {
      updateLine(exists.id, 'quantity', exists.quantity + 1)
      setShowSearch(false)
      return
    }
    const price = p.selling_price ?? p.cost_price
    const calc  = calcLine(price, 1, p.tax_type)
    const newLine: OrderLine = {
      id:               `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      product_id:       p.id,
      product_code:     p.product_code,
      product_name:     p.name,
      unit_price:       price,
      cost_price:       p.cost_price,
      tax_type:         p.tax_type,
      fulfillment_type: 'consignment',
      quantity:         1,
      supply_price:     calc.supply_price,
      vat_amount:       calc.vat_amount,
      line_total:       calc.line_total,
    }
    setLines(prev => [...prev, newLine])
    setShowSearch(false)
  }

  // ── 저장 ─────────────────────────────────────────────────────

  function handleSave() {
    setError(null)
    if (lines.length === 0) { setError('상품을 1개 이상 포함해야 합니다.'); return }
    const zeroQty = lines.find(l => l.quantity <= 0)
    if (zeroQty) { setError(`'${zeroQty.product_name}' 수량이 0 이하입니다. 수정하거나 삭제해주세요.`); return }
    startTransition(async () => {
      const r = await updateOrder({
        order_id:   order.id,
        order_date: orderDate,
        memo,
        lines: lines.map(l => ({
          product_id:       l.product_id,
          product_code:     l.product_code,
          product_name:     l.product_name,
          quantity:         l.quantity,
          unit_price:       l.unit_price,
          cost_price:       l.cost_price,
          tax_type:         l.tax_type,
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
      if (r.success) router.push('/orders')
      else setError(r.error ?? '취소 실패')
    })
  }

  // ── 렌더 ─────────────────────────────────────────────────────

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

      {error   && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>저장됐습니다.</div>}

      <div style={s.form}>
        <F label="주문일">
          <input style={s.input} type="date" value={orderDate}
            onChange={e => setOrderDate(e.target.value)} disabled={isLocked} />
        </F>

        {/* 주문 상품 */}
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
              {lines.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{l.product_name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>
                      {l.product_code} · {l.tax_type === 'exempt' ? '면세' : '과세'}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {isLocked ? l.quantity : (
                      <input type="number" style={s.numInput} value={l.quantity} min={-999} max={9999}
                        onChange={e => updateLine(l.id, 'quantity', Number(e.target.value))}
                        onBlur={e => handleQtyBlur(l.id, Number(e.target.value))} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {isLocked ? formatKRW(l.unit_price) : (
                      <input type="number" style={s.numInput} value={l.unit_price} min={0}
                        onChange={e => updateLine(l.id, 'unit_price', Number(e.target.value))} />
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatKRW(l.line_total)}
                  </td>
                  {!isLocked && (
                    <td style={td}>
                      <button type="button" style={s.removeBtn}
                        onClick={() => removeLine(l.id)}
                        title="라인 삭제">
                        ✕
                      </button>
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

          {/* 상품 추가 버튼 + 검색 */}
          {!isLocked && (
            <div style={{ marginTop: 10 }}>
              {!showSearch ? (
                <button type="button" style={s.addBtn} onClick={() => setShowSearch(true)}>
                  + 상품 추가
                </button>
              ) : (
                <ProductSearchInput
                  products={products}
                  onSelect={addProduct}
                  onClose={() => setShowSearch(false)}
                />
              )}
            </div>
          )}
        </div>

        <F label="메모">
          <textarea style={{ ...s.input, height: 72, resize: 'vertical' }} value={memo}
            onChange={e => setMemo(e.target.value)} disabled={isLocked} />
        </F>

        {!isLocked && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={s.backBtn} onClick={() => router.push('/orders')}>돌아가기</button>
            <button type="button" style={isPending ? s.submitOff : s.submit}
              onClick={handleSave} disabled={isPending}>
              {isPending ? '저장 중...' : '수정 저장'}
            </button>
          </div>
        )}

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
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="취소 사유 (선택)" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" style={s.backBtn}
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

// ── 서브 컴포넌트 ─────────────────────────────────────────────

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

// ── 스타일 ───────────────────────────────────────────────────

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
  addBtn:           { padding: '7px 14px', border: '1px dashed #93C5FD', borderRadius: 7, background: '#F0F9FF', color: '#2563EB', fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  backBtn:          { flex: 1, padding: '11px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  submit:           { flex: 2, padding: '11px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  submitOff:        { flex: 2, padding: '11px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'not-allowed' },
  dangerBtn:        { padding: '8px 16px', background: '#fff', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  cancelBox:        { background: '#FFF1F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: 16 },
  confirmCancelBtn: { flex: 2, padding: '11px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
}