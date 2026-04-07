'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { createOrder, getCustomersForOrder, getProductsForOrder } from '@/actions/order'
import { calcLine, calcMarginRate, formatKRW, todayStr } from '@/lib/calc'
import type {
  CustomerForOrder,
  ProductForOrder,
  OrderLineInput,
} from '@/types/order'

// ── 라인 아이템 (UI 상태) ────────────────────────────────────

interface LineItem {
  uid: string
  product: ProductForOrder
  quantity: number
  unit_price: number
}

// ── 메인 컴포넌트 ────────────────────────────────────────────

interface OrderCreateFormProps {
  initialCustomerId?: string   // 거래처 pre-fill
  reorderLines?: Array<{       // 재주문 라인 복제
    product_id: string
    product_name: string
    product_code: string
    quantity: number
    unit_price: number
  }>
}

export default function OrderCreateForm({
  initialCustomerId,
  reorderLines,
}: OrderCreateFormProps = {}) {
  const [isPending, startTransition] = useTransition()

  const [customers, setCustomers] = useState<CustomerForOrder[]>([])
  const [products, setProducts] = useState<ProductForOrder[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [showCustomerDd, setShowCustomerDd] = useState(false)

  const [productQuery, setProductQuery] = useState('')
  const [showProductDd, setShowProductDd] = useState(false)

  const [lines, setLines] = useState<LineItem[]>([])
  const [orderDate, setOrderDate] = useState(todayStr())
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const productRef = useRef<HTMLInputElement>(null)

  // ── 데이터 로드 ──────────────────────────────────────────

  useEffect(() => {
    getCustomersForOrder().then((r) => {
      if (!r.success) return
      const list = r.data ?? []
      setCustomers(list)
      // initialCustomerId가 있으면 자동 선택
      if (initialCustomerId) {
        const found = list.find((c) => c.id === initialCustomerId)
        if (found) {
          setSelectedCustomer(found)
          setCustomerQuery(found.name)
        }
      }
    })
  }, [initialCustomerId])

  useEffect(() => {
    if (!selectedCustomer) return
    setLoadingProducts(true)
    getProductsForOrder(selectedCustomer.id).then((r) => {
      if (!r.success) { setLoadingProducts(false); return }
      const prods = r.data ?? []
      setProducts(prods)
      setLoadingProducts(false)

      // 재주문: 이전 라인을 복제
      if (reorderLines && reorderLines.length > 0) {
        const mapped = reorderLines.flatMap((rl) => {
          const prod = prods.find((p) => p.id === rl.product_id)
          if (!prod) return []
          return [{
            uid: Math.random().toString(36).slice(2),
            product: prod,
            quantity: rl.quantity,
            unit_price: rl.unit_price,
          }]
        })
        if (mapped.length > 0) setLines(mapped)
      }
    })
  }, [selectedCustomer, reorderLines])

  // ── 필터 ─────────────────────────────────────────────────

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerQuery.toLowerCase()),
  )

  const filteredProducts = products.filter(
    (p) =>
      !lines.find((l) => l.product.id === p.id) &&
      (p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
        p.product_code.toLowerCase().includes(productQuery.toLowerCase())),
  )

  // ── 거래처 선택 ──────────────────────────────────────────

  const selectCustomer = useCallback((c: CustomerForOrder) => {
    setSelectedCustomer(c)
    setCustomerQuery(c.name)
    setShowCustomerDd(false)
    setLines([])
    setError(null)
    setTimeout(() => productRef.current?.focus(), 80)
  }, [])

  // ── 상품 추가 ─────────────────────────────────────────────

  const addProduct = useCallback((p: ProductForOrder) => {
    setLines((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), product: p, quantity: 1, unit_price: p.last_unit_price },
    ])
    setProductQuery('')
    setShowProductDd(false)
    productRef.current?.focus()
  }, [])

  // ── 라인 수정/삭제 ───────────────────────────────────────

  const updateLine = useCallback(
    (uid: string, field: 'quantity' | 'unit_price', value: number) => {
      setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, [field]: value } : l)))
    },
    [],
  )

  const removeLine = useCallback((uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid))
  }, [])

  // ── 합계 ─────────────────────────────────────────────────

  const totals = lines.reduce(
    (acc, l) => {
      const c = calcLine(l.unit_price, l.quantity, l.product.tax_type)
      return {
        supply: acc.supply + c.supply_price,
        vat: acc.vat + c.vat_amount,
        total: acc.total + c.line_total,
      }
    },
    { supply: 0, vat: 0, total: 0 },
  )

  // ── 저장 ─────────────────────────────────────────────────

  function handleSubmit() {
    if (!selectedCustomer) { setError('거래처를 선택해주세요.'); return }
    if (!lines.length) { setError('상품을 1개 이상 추가해주세요.'); return }
    setError(null)
    setSuccess(null)

    const lineInputs: OrderLineInput[] = lines.map((l) => ({
      product_id: l.product.id,
      product_code: l.product.product_code,
      product_name: l.product.name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      cost_price: l.product.current_cost_price,
      tax_type: l.product.tax_type,
      fulfillment_type: l.product.fulfillment_type,
    }))

    startTransition(async () => {
      const res = await createOrder({
        customer_id: selectedCustomer.id,
        order_date: orderDate,
        memo: memo || undefined,
        lines: lineInputs,
      })
      if (res.success && res.data) {
        setSuccess(
          `✓ ${res.data.order_number} 등록 완료 — ${formatKRW(res.data.total_amount)}`,
        )
        setLines([])
        setMemo('')
      } else {
        setError(res.error ?? '저장 실패')
      }
    })
  }

  // ── Enter 키로 첫 번째 상품 선택 ─────────────────────────

  function handleProductKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      e.preventDefault()
      addProduct(filteredProducts[0])
    }
    if (e.key === 'Escape') setShowProductDd(false)
  }

  // ── 렌더 ─────────────────────────────────────────────────

  return (
    <div style={s.wrap}>
      {/* 타이틀 바 */}
      <div style={s.titleBar}>
        <span style={s.titleText}>주문 등록</span>
        {selectedCustomer && (
          <span style={s.customerBadge}>{selectedCustomer.name}</span>
        )}
      </div>

      {/* 메시지 */}
      {error && <div style={s.errBox}>{error}</div>}
      {success && <div style={s.okBox}>{success}</div>}

      {/* 상단 입력 */}
      <div style={s.topRow}>
        {/* 거래처 */}
        <div style={{ ...s.field, flex: 2 }}>
          <label style={s.label}>거래처 *</label>
          <div style={s.rel}>
            <input
              style={s.input}
              placeholder="거래처명 검색..."
              value={customerQuery}
              onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerDd(true) }}
              onFocus={() => setShowCustomerDd(true)}
              onBlur={() => setTimeout(() => setShowCustomerDd(false), 150)}
              autoComplete="off"
            />
            {showCustomerDd && filteredCustomers.length > 0 && (
              <ul style={s.dd}>
                {filteredCustomers.slice(0, 8).map((c) => (
                  <li
                    key={c.id}
                    style={s.ddItem}
                    onMouseDown={() => selectCustomer(c)}
                  >
                    <span>{c.name}</span>
                    {c.payment_terms_days > 0 && (
                      <span style={s.pill}>{c.payment_terms_days}일 외상</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 주문일 */}
        <div style={{ ...s.field, flex: 1, maxWidth: 168 }}>
          <label style={s.label}>주문일</label>
          <input
            type="date"
            style={s.input}
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </div>
      </div>

      {/* 상품 검색 */}
      {selectedCustomer && (
        <div style={s.field}>
          <label style={s.label}>
            상품 추가
            {loadingProducts && <span style={s.loading}> 불러오는 중...</span>}
          </label>
          <div style={s.rel}>
            <input
              ref={productRef}
              style={s.input}
              placeholder="상품명·코드 검색 — Enter로 첫 번째 선택"
              value={productQuery}
              onChange={(e) => { setProductQuery(e.target.value); setShowProductDd(true) }}
              onFocus={() => setShowProductDd(true)}
              onBlur={() => setTimeout(() => setShowProductDd(false), 150)}
              onKeyDown={handleProductKeyDown}
              autoComplete="off"
              disabled={loadingProducts}
            />
            {showProductDd && filteredProducts.length > 0 && (
              <ul style={s.dd}>
                {filteredProducts.slice(0, 8).map((p) => (
                  <li
                    key={p.id}
                    style={s.ddItem}
                    onMouseDown={() => addProduct(p)}
                  >
                    <span style={s.pCode}>{p.product_code}</span>
                    <span style={s.pName}>{p.name}</span>
                    <span style={s.pPrice}>{formatKRW(p.last_unit_price)}</span>
                    {p.tax_type === 'exempt' && <span style={s.pillGray}>면세</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 주문 라인 */}
      {lines.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['상품', '수량', '판매가', '공급가', '부가세', '합계', '마진율', ''].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const calc = calcLine(line.unit_price, line.quantity, line.product.tax_type)
                const margin = calcMarginRate(line.unit_price, line.product.current_cost_price)
                const isRefund = line.quantity < 0
                return (
                  <tr key={line.uid} style={isRefund ? s.refundRow : s.tr}>
                    <td style={s.td}>
                      <div style={s.pCell}>
                        <span style={s.pCellName}>{line.product.name}</span>
                        <span style={s.pCellCode}>{line.product.product_code}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <input
                        type="number"
                        style={s.qtyInput}
                        value={line.quantity}
                        onChange={(e) => updateLine(line.uid, 'quantity', Number(e.target.value))}
                      />
                    </td>
                    <td style={s.td}>
                      <input
                        type="number"
                        style={s.priceInput}
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.uid, 'unit_price', Number(e.target.value))}
                      />
                    </td>
                    <td style={{ ...s.td, ...s.num }}>{calc.supply_price.toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.num }}>{calc.vat_amount.toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.num, fontWeight: 500 }}>
                      {calc.line_total.toLocaleString()}
                    </td>
                    <td style={{ ...s.td, ...s.num }}>
                      <span style={margin < 5 ? s.marginBad : s.marginOk}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                    <td style={s.td}>
                      <button style={s.rmBtn} onClick={() => removeLine(line.uid)} title="삭제">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 합계 바 */}
      {lines.length > 0 && (
        <div style={s.totalsBar}>
          <span style={s.totalLabel}>공급가</span>
          <span style={s.totalVal}>{formatKRW(totals.supply)}</span>
          <span style={s.sep}>|</span>
          <span style={s.totalLabel}>부가세</span>
          <span style={s.totalVal}>{formatKRW(totals.vat)}</span>
          <span style={s.sep}>|</span>
          <span style={s.totalLabel}>합계</span>
          <span style={s.totalBig}>{formatKRW(totals.total)}</span>
        </div>
      )}

      {/* 메모 */}
      <div style={s.field}>
        <label style={s.label}>메모</label>
        <input
          style={s.input}
          placeholder="전달사항 (선택)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      {/* 저장 버튼 */}
      <div style={s.footer}>
        <button
          style={isPending || !lines.length ? s.btnOff : s.btn}
          onClick={handleSubmit}
          disabled={isPending || !lines.length}
        >
          {isPending ? '저장 중...' : `주문 등록${lines.length ? ` (${formatKRW(totals.total)})` : ''}`}
        </button>
      </div>
    </div>
  )
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 920,
    margin: '0 auto',
    padding: '28px 24px 48px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #e5e7eb',
  },
  titleText: { fontSize: 18, fontWeight: 600 },
  customerBadge: {
    background: '#EFF6FF',
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: 500,
    padding: '3px 10px',
    borderRadius: 20,
  },
  errBox: {
    background: '#FEF2F2', color: '#DC2626',
    border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, marginBottom: 16,
  },
  okBox: {
    background: '#F0FDF4', color: '#15803D',
    border: '1px solid #BBF7D0', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, marginBottom: 16,
  },
  topRow: { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16, flex: 1 },
  label: { fontSize: 11, fontWeight: 500, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase' },
  loading: { color: '#9ca3af', fontWeight: 400 },
  rel: { position: 'relative' },
  input: {
    width: '100%', padding: '9px 12px',
    border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 14, outline: 'none', background: '#fff',
    boxSizing: 'border-box',
  },
  dd: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    boxShadow: '0 4px 20px rgba(0,0,0,0.10)', zIndex: 50,
    maxHeight: 300, overflowY: 'auto', listStyle: 'none',
    margin: 0, padding: 0,
  },
  ddItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', cursor: 'pointer', fontSize: 14,
    borderBottom: '1px solid #f9fafb',
  },
  pill: {
    marginLeft: 'auto', fontSize: 11, padding: '2px 7px',
    borderRadius: 12, background: '#FEF3C7', color: '#92400E',
  },
  pillGray: {
    fontSize: 11, padding: '2px 7px',
    borderRadius: 12, background: '#F3F4F6', color: '#6b7280',
  },
  pCode: { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', minWidth: 76 },
  pName: { flex: 1 },
  pPrice: { marginLeft: 'auto', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  tableWrap: {
    border: '1px solid #e5e7eb', borderRadius: 10,
    overflowX: 'auto', marginBottom: 12,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '9px 12px', textAlign: 'left',
    fontSize: 11, fontWeight: 500, color: '#6b7280',
    background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  tr: {},
  refundRow: { background: '#FFF5F5' },
  td: { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151' },
  pCell: { display: 'flex', flexDirection: 'column', gap: 2 },
  pCellName: { fontWeight: 500 },
  pCellCode: { fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' },
  qtyInput: {
    width: 72, padding: '6px 8px',
    border: '1px solid #e5e7eb', borderRadius: 6,
    fontSize: 13, textAlign: 'center', outline: 'none',
  },
  priceInput: {
    width: 108, padding: '6px 8px',
    border: '1px solid #e5e7eb', borderRadius: 6,
    fontSize: 13, textAlign: 'right', outline: 'none',
  },
  marginBad: { color: '#DC2626', fontWeight: 500 },
  marginOk: { color: '#16A34A' },
  rmBtn: {
    background: 'none', border: 'none',
    color: '#d1d5db', cursor: 'pointer',
    fontSize: 13, padding: '3px 6px', borderRadius: 4,
  },
  totalsBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px', background: '#f9fafb',
    borderRadius: 8, marginBottom: 16, fontSize: 13,
  },
  totalLabel: { color: '#6b7280' },
  totalVal: { fontVariantNumeric: 'tabular-nums', marginRight: 4 },
  sep: { color: '#e5e7eb' },
  totalBig: {
    fontSize: 20, fontWeight: 700,
    marginLeft: 'auto', fontVariantNumeric: 'tabular-nums',
  },
  footer: { display: 'flex', justifyContent: 'flex-end', paddingTop: 4 },
  btn: {
    padding: '13px 32px', background: '#111827',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 500, cursor: 'pointer',
  },
  btnOff: {
    padding: '13px 32px', background: '#e5e7eb',
    color: '#9ca3af', border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 500, cursor: 'not-allowed',
  },
}
