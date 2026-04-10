'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { createOrder, getCustomersForOrder, getProductsForOrder } from '@/actions/order'
import { createPayment } from '@/actions/payment'
import type { PaymentMethod } from '@/actions/payment'
import { calcLine, calcMarginRate, formatKRW, todayStr } from '@/lib/calc'
import type { CustomerForOrder, ProductForOrder, OrderLineInput } from '@/types/order'

// ============================================================
// 타입
// ============================================================

interface LineItem {
  uid:              string
  product:          ProductForOrder
  quantity:         number
  unit_price_input: string      // 사용자가 직접 입력한 단가 (소수 허용, 표시용)
  total_input:      string      // 사용자가 직접 입력한 총액 (정수 문자열)
  mode:             'unit' | 'total'  // 마지막으로 수정한 필드가 source of truth
}

// ============================================================
// 계산 로직 — 단방향, 무한루프 없음
// ============================================================

/**
 * [mode=unit] 단가 → 총액
 * 저장값: unit_price=round(input), total=qty*unit_price
 */
function unitToTotal(qty: number, unitInput: string): { unit: number; total: number } {
  const unit = Math.round(parseFloat(unitInput) || 0)
  const total = qty * unit
  return { unit, total }
}

/**
 * [mode=total] 총액 → 단가 보정
 *
 * 주문 라인이 1개이므로 단가는 단순히 total/qty (정수 반올림).
 * 단, total은 입력값 그대로 100% 보존.
 * 저장값: total=입력값, unit_price=floor(total/qty) (표시용 소수는 별도)
 *
 * 왜 floor인가: ceil이면 qty*unit > total이 될 수 있음
 * 실제 DB 저장 시: total_amount는 입력값 그대로, unit_price는 floor
 */
function totalToUnit(qty: number, totalInput: string): {
  unit: number        // DB 저장용 정수 단가 (floor)
  unitDisplay: string // UI 표시용 (소수 포함 가능)
  total: number       // DB 저장용 총액 (입력값 100% 보존)
} {
  const total = parseInt(totalInput.replace(/[^0-9]/g, ''), 10) || 0
  if (qty === 0) return { unit: 0, unitDisplay: '', total }
  const exact    = total / qty
  const unit     = Math.floor(exact)  // DB 저장: floor (total 보존 우선)
  const unitDisplay = Number.isInteger(exact)
    ? String(exact)
    : exact.toFixed(2)
  return { unit, unitDisplay, total }
}

// ── 저장용 값 추출 ────────────────────────────────────────────

function resolveForSave(line: LineItem): {
  unit_price: number
  total_amount: number
  line_total_override?: number  // mode=total일 때만 세팅 — order.ts에서 line_total로 직접 사용
} {
  const qty = Math.abs(line.quantity)

  if (line.mode === 'total') {
    // 총액 기준: 입력값 100% 보존, unit_price는 floor (표시/참고용)
    const total = parseInt(line.total_input.replace(/[^0-9]/g, ''), 10) || 0
    const signedTotal = line.quantity < 0 ? -total : total
    const unit  = qty === 0 ? 0 : Math.floor(total / qty)
    return {
      unit_price:             unit,
      total_amount:           signedTotal,
      line_total_override:  signedTotal,  // line_total을 이 값으로 직접 저장
    }
  }

  // 단가 기준: unit_price * qty = total (정확히 일치)
  const unit  = Math.round(parseFloat(line.unit_price_input) || 0)
  const total = unit * line.quantity  // 부호 포함
  return { unit_price: unit, total_amount: total }
}

// ── 표시용 값 ─────────────────────────────────────────────────

function getDisplayUnit(line: LineItem): string {
  if (line.mode === 'unit') return line.unit_price_input
  // mode=total: 총액에서 역산해서 표시
  const qty = Math.abs(line.quantity)
  if (qty === 0) return ''
  const { unitDisplay } = totalToUnit(qty, line.total_input)
  return unitDisplay
}

function getDisplayTotal(line: LineItem): string {
  if (line.mode === 'total') return line.total_input
  // mode=unit: 단가에서 계산해서 표시
  const qty = Math.abs(line.quantity)
  const { total } = unitToTotal(qty, line.unit_price_input)
  return total > 0 ? String(total) : ''
}

// ── 합계 계산 (표시용) ────────────────────────────────────────

function calcLineTotals(line: LineItem) {
  const { unit_price, total_amount } = resolveForSave(line)
  return calcLine(unit_price, line.quantity, line.product.tax_type)
}

// ============================================================
// 상품 정렬 — 거래처 구매이력 상단
// ============================================================

function sortByPurchaseHistory(products: ProductForOrder[]): ProductForOrder[] {
  return [...products].sort((a, b) => {
    const aHas = a.last_unit_price > 0
    const bHas = b.last_unit_price > 0
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    return a.name.localeCompare(b.name)
  })
}

// ============================================================
// 컴포넌트
// ============================================================

interface OrderCreateFormProps {
  initialCustomerId?: string
  reorderLines?: Array<{
    product_id:   string
    product_name: string
    product_code: string
    quantity:     number
    unit_price:   number
    tax_type?:    string
  }>
}

export default function OrderCreateForm({
  initialCustomerId,
  reorderLines,
}: OrderCreateFormProps = {}) {
  const [isPending, startTransition] = useTransition()

  const [customers,       setCustomers]       = useState<CustomerForOrder[]>([])
  const [products,        setProducts]        = useState<ProductForOrder[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)
  const [customerQuery,    setCustomerQuery]    = useState('')
  const [showCustomerDd,   setShowCustomerDd]   = useState(false)

  const [productQuery,  setProductQuery]  = useState('')
  const [showProductDd, setShowProductDd] = useState(false)

  const [lines,     setLines]     = useState<LineItem[]>([])
  const [orderDate, setOrderDate] = useState(todayStr())
  const [memo,      setMemo]      = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const productRef = useRef<HTMLInputElement>(null)

  // 수금 상태
  const [doPayment,      setDoPayment]      = useState(false)
  const [paymentAmount,  setPaymentAmount]  = useState('')
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethod>('transfer')
  const [paymentDate,    setPaymentDateP]   = useState(todayStr())
  const [paymentError,   setPaymentError]   = useState<string | null>(null)
  const [paymentFailed,  setPaymentFailed]  = useState<{ orderId: string; customerId: string; amount: number } | null>(null)
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null)

  // ── 데이터 로드 ──────────────────────────────────────────

  useEffect(() => {
    getCustomersForOrder().then((r) => {
      if (!r.success) return
      const list = r.data ?? []
      setCustomers(list)
      if (initialCustomerId) {
        const found = list.find((c) => c.id === initialCustomerId)
        if (found) { setSelectedCustomer(found); setCustomerQuery(found.name) }
      }
    })
  }, [initialCustomerId])

  useEffect(() => {
    if (!selectedCustomer) return
    setLoadingProducts(true)
    getProductsForOrder(selectedCustomer.id).then((r) => {
      if (!r.success) { setLoadingProducts(false); return }
      const sorted = sortByPurchaseHistory(r.data ?? [])
      setProducts(sorted)
      setLoadingProducts(false)

      // 재주문 라인 복제
      if (reorderLines?.length) {
        const mapped = reorderLines.flatMap((rl) => {
          const prod = sorted.find((p) => p.id === rl.product_id)
          if (!prod) return []
          const snap = rl.tax_type
            ? { ...prod, tax_type: rl.tax_type as 'taxable' | 'exempt' }
            : prod
          return [{
            uid:              crypto.randomUUID(),
            product:          snap,
            quantity:         rl.quantity,
            unit_price_input: String(rl.unit_price),
            total_input:      String(Math.abs(rl.quantity) * rl.unit_price),
            mode:             'unit' as const,
          }]
        })
        if (mapped.length) setLines(mapped)
      }
    })
  }, [selectedCustomer, reorderLines])

  // ── 합계 ─────────────────────────────────────────────────

  const totals = lines.reduce(
    (acc, l) => {
      const c = calcLineTotals(l)
      return { supply: acc.supply + c.supply_price, vat: acc.vat + c.vat_amount, total: acc.total + c.line_total }
    },
    { supply: 0, vat: 0, total: 0 },
  )

  useEffect(() => {
    if (doPayment && totals.total > 0) setPaymentAmount(String(totals.total))
  }, [totals.total, doPayment])

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
    setSelectedCustomer(c); setCustomerQuery(c.name)
    setShowCustomerDd(false); setLines([]); setError(null)
    setTimeout(() => productRef.current?.focus(), 80)
  }, [])

  // ── 상품 추가 ─────────────────────────────────────────────
  // 최근 단가는 "기본값"만 제공 — mode=unit으로 시작

  const addProduct = useCallback((p: ProductForOrder) => {
    const unitPrice = p.last_unit_price  // customer_product_prices 캐시
    const hasPrice  = unitPrice > 0
    setLines((prev) => [...prev, {
      uid:              crypto.randomUUID(),
      product:          p,
      quantity:         1,
      unit_price_input: hasPrice ? String(unitPrice) : '',
      total_input:      hasPrice ? String(unitPrice) : '',
      mode:             'unit',  // 항상 unit 모드로 시작 — 사용자가 총액 입력하면 전환
    }])
    setProductQuery(''); setShowProductDd(false)
    productRef.current?.focus()
  }, [])

  // ── 라인 수정 — 각 핸들러는 해당 방향만 계산, 반대 방향 갱신 없음 ──

  const updateQuantity = useCallback((uid: string, rawVal: string) => {
    const qty = parseInt(rawVal, 10)
    if (isNaN(qty)) return
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      // mode 유지, 현재 mode 기준으로 반대쪽 표시값만 재계산
      if (l.mode === 'unit') {
        const absQty = Math.abs(qty)
        const { total } = unitToTotal(absQty, l.unit_price_input)
        return { ...l, quantity: qty, total_input: total > 0 ? String(total) : '' }
      } else {
        // mode=total: total은 고정, unit 표시만 변경 (getDisplayUnit에서 계산)
        return { ...l, quantity: qty }
      }
    }))
  }, [])

  const updateUnitPrice = useCallback((uid: string, value: string) => {
    // 단가 수정 → mode=unit 전환, total 재계산
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      const qty = Math.abs(l.quantity)
      const { total } = unitToTotal(qty, value)
      return {
        ...l,
        mode:             'unit',
        unit_price_input: value,
        total_input:      total > 0 ? String(total) : '',
      }
    }))
  }, [])

  const updateTotalAmount = useCallback((uid: string, value: string) => {
    // 총액 수정 → mode=total 전환, unit 표시만 갱신 (단가 필드는 getDisplayUnit에서 표시)
    const numeric = value.replace(/[^0-9]/g, '')
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      return {
        ...l,
        mode:             'total',
        total_input:      numeric,
        unit_price_input: '',   // 총액 기준일 때 단가 입력값 초기화 (표시는 getDisplayUnit)
      }
    }))
  }, [])

  const removeLine = useCallback((uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid))
  }, [])

  // ── 저장 ─────────────────────────────────────────────────

  function handleSubmit() {
    if (isSubmitting) return
    if (!selectedCustomer) { setError('거래처를 선택해주세요.'); return }
    if (!lines.length)      { setError('상품을 1개 이상 추가해주세요.'); return }
    const zeroQty = lines.find((l) => l.quantity === 0)
    if (zeroQty) { setError(`[${zeroQty.product.name}] 수량을 입력해주세요.`); return }
    setError(null); setSuccess(null); setIsSubmitting(true)

    // 저장 직전: unit_price 정수, total_amount 입력값 100% 보존
    const lineInputs: OrderLineInput[] = lines.map((l) => {
      const saved = resolveForSave(l)
      return {
        product_id:            l.product.id,
        product_code:          l.product.product_code,
        product_name:          l.product.name,
        quantity:              l.quantity,
        unit_price:            saved.unit_price,
        cost_price:            l.product.current_cost_price,
        tax_type:              l.product.tax_type,
        fulfillment_type:      l.product.fulfillment_type,
        line_total_override: saved.line_total_override,  // mode=total일 때만 존재
      }
    })

    startTransition(async () => {
      const res = await createOrder({
        customer_id: selectedCustomer.id,
        order_date:  orderDate,
        memo:        memo || undefined,
        lines:       lineInputs,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? '저장 실패'); setIsSubmitting(false); return
      }

      let successMsg = `✓ ${res.data.order_number} 등록 완료 — ${formatKRW(res.data.total_amount)}`

      if (doPayment) {
        const amt = Math.round(Number(paymentAmount))
        if (amt > 0) {
          const pr = await createPayment({
            customer_id: selectedCustomer.id, amount: amt,
            payment_date: paymentDate, payment_method: paymentMethod,
          })
          if (pr.success && pr.data) {
            const dep = pr.data.deposit_amount
            successMsg += dep > 0 ? ` | 수금 완료 (예치금 +${formatKRW(dep)})` : ` | 수금 완료`
            setPaymentError(null); setPaymentFailed(null)
            setPaymentWarning(pr.data.warning ?? null)
          } else {
            setPaymentFailed({ orderId: res.data!.order_id, customerId: selectedCustomer.id, amount: amt })
            setPaymentError(pr.error ?? '알 수 없는 오류')
            successMsg = `✓ 주문 완료 / ⚠️ 수금 실패`
          }
        }
      }

      setSuccess(successMsg)
      setLines([]); setMemo(''); setDoPayment(false); setPaymentAmount('')
      setIsSubmitting(false)
      setPaymentFailed(null); setPaymentError(null); setPaymentWarning(null)
    })
  }

  function handleProductKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      e.preventDefault(); addProduct(filteredProducts[0])
    }
    if (e.key === 'Escape') setShowProductDd(false)
  }

  // ── 렌더 ─────────────────────────────────────────────────

  return (
    <div style={s.wrap}>
      <div style={s.titleBar}>
        <span style={s.titleText}>주문 등록</span>
        {selectedCustomer && <span style={s.customerBadge}>{selectedCustomer.name}</span>}
      </div>

      {error && <div style={s.errBox}>{error}</div>}

      {paymentWarning && (
        <div style={s.warnBox}>
          <span>⚠️ {paymentWarning}</span>
          <button type="button" style={s.warnClose} onClick={() => setPaymentWarning(null)}>✕</button>
        </div>
      )}

      {paymentFailed && (
        <div style={s.paymentFailBanner}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>⚠️ 수금이 저장되지 않았습니다</p>
            <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>{paymentError}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>주문은 정상 등록됐습니다. 아래 버튼으로 지금 수금하세요.</p>
          </div>
          <a href={`/payments/new?customer_id=${paymentFailed.customerId}&amount=${paymentFailed.amount}`}
            style={s.payNowBtn}>지금 수금하기 →</a>
        </div>
      )}

      {success && (
        <div style={s.okBox}>
          <span>{success}</span>
          <span style={{ fontSize: 11, color: '#15803D', marginTop: 4, display: 'block' }}>
            잠시 후 주문 목록으로 이동합니다...
          </span>
        </div>
      )}

      {/* 상단 입력 */}
      <div style={s.topRow}>
        <div style={{ ...s.field, flex: 2 }}>
          <label style={s.label}>거래처 *</label>
          <div style={s.rel}>
            <input style={s.input} placeholder="거래처명 검색..."
              value={customerQuery}
              onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerDd(true) }}
              onFocus={() => setShowCustomerDd(true)}
              onBlur={() => setTimeout(() => setShowCustomerDd(false), 150)}
              autoComplete="off" />
            {showCustomerDd && filteredCustomers.length > 0 && (
              <ul style={s.dd}>
                {filteredCustomers.slice(0, 8).map((c) => (
                  <li key={c.id} style={s.ddItem} onMouseDown={() => selectCustomer(c)}>
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
        <div style={{ ...s.field, flex: 1, maxWidth: 168 }}>
          <label style={s.label}>주문일</label>
          <input type="date" style={s.input} value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)} />
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
            <input ref={productRef} style={s.input}
              placeholder="상품명·코드 검색 — Enter로 첫 번째 선택"
              value={productQuery}
              onChange={(e) => { setProductQuery(e.target.value); setShowProductDd(true) }}
              onFocus={() => setShowProductDd(true)}
              onBlur={() => setTimeout(() => setShowProductDd(false), 150)}
              onKeyDown={handleProductKeyDown}
              autoComplete="off" disabled={loadingProducts} />
            {showProductDd && filteredProducts.length > 0 && (
              <ul style={s.dd}>
                {filteredProducts.slice(0, 10).map((p) => {
                  const hasPrev = p.last_unit_price > 0
                  return (
                    <li key={p.id} style={{
                      ...s.ddItem,
                      background:  hasPrev ? '#FAFFF4' : '#fff',
                      borderLeft:  hasPrev ? '3px solid #86EFAC' : '3px solid transparent',
                    }} onMouseDown={() => addProduct(p)}>
                      <span style={s.pCode}>{p.product_code}</span>
                      <span style={s.pName}>
                        {p.name}
                        {hasPrev && <span style={s.prevBadge}>최근구매</span>}
                      </span>
                      <span style={s.pPrice}>{formatKRW(p.last_unit_price)}</span>
                      {p.tax_type === 'exempt' && <span style={s.pillGray}>면세</span>}
                    </li>
                  )
                })}
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
                {['상품', '수량', '단가', '총액', '공급가', '부가세', '합계', '마진율', ''].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const saved  = resolveForSave(line)
                const calc   = calcLine(saved.unit_price, line.quantity, line.product.tax_type)
                const margin = calcMarginRate(saved.unit_price, line.product.current_cost_price)
                const isRefund = line.quantity < 0
                const unitDisplay  = getDisplayUnit(line)
                const totalDisplay = getDisplayTotal(line)

                return (
                  <tr key={line.uid} style={isRefund ? s.refundRow : s.tr}>
                    <td style={s.td}>
                      <div style={s.pCell}>
                        <span style={s.pCellName}>{line.product.name}</span>
                        <span style={s.pCellCode}>{line.product.product_code}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <input type="number" style={s.qtyInput}
                        value={line.quantity || ''}
                        step={1}
                        onChange={(e) => updateQuantity(line.uid, e.target.value)} />
                    </td>
                    {/* 단가 — 활성(mode=unit)이면 보라 테두리 */}
                    <td style={s.td}>
                      <input type="text" inputMode="decimal"
                        style={{ ...s.priceInput, borderColor: line.mode === 'unit' ? '#6366f1' : '#e5e7eb' }}
                        value={unitDisplay}
                        onChange={(e) => updateUnitPrice(line.uid, e.target.value)}
                        placeholder="단가" />
                      {line.mode === 'unit' && (
                        <div style={s.modeBadge}>기준</div>
                      )}
                    </td>
                    {/* 총액 — 활성(mode=total)이면 보라 테두리 */}
                    <td style={s.td}>
                      <input type="text" inputMode="numeric"
                        style={{ ...s.priceInput, borderColor: line.mode === 'total' ? '#6366f1' : '#e5e7eb' }}
                        value={totalDisplay}
                        onChange={(e) => updateTotalAmount(line.uid, e.target.value)}
                        placeholder="총액" />
                      {line.mode === 'total' && (
                        <div style={{ ...s.modeBadge, color: '#059669' }}
                          title="총액이 기준입니다. 단가는 표시용이며, 일부 단가는 ±1원 보정될 수 있습니다.">
                          총액기준 ⓘ
                        </div>
                      )}
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
                      <button style={s.rmBtn} onClick={() => removeLine(line.uid)}>✕</button>
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
        <input style={s.input} placeholder="전달사항 (선택)"
          value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>

      {/* 수금 동시 처리 */}
      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          <input type="checkbox" checked={doPayment}
            onChange={(e) => {
              setDoPayment(e.target.checked)
              if (e.target.checked && totals.total > 0) setPaymentAmount(String(totals.total))
            }} />
          수금 동시 처리
        </label>
        {doPayment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>수금 금액</div>
                <input style={s.input} type="number" value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0" min={0} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>수금일</div>
                <input style={s.input} type="date" value={paymentDate}
                  onChange={(e) => setPaymentDateP(e.target.value)} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>수금 방식</div>
              <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                {(['transfer', 'cash', 'card', 'platform'] as PaymentMethod[]).map((m, i) => (
                  <button key={m} type="button" style={{
                    flex: 1, padding: '7px', border: 'none', fontSize: 12, cursor: 'pointer',
                    borderRight: i < 3 ? '1px solid #e5e7eb' : 'none',
                    background: paymentMethod === m ? '#111827' : '#fff',
                    color:      paymentMethod === m ? '#fff' : '#374151',
                  }} onClick={() => setPaymentMethod(m)}>
                    {m === 'transfer' ? '무통장' : m === 'cash' ? '현금' : m === 'card' ? '카드' : '플랫폼'}
                  </button>
                ))}
              </div>
            </div>
            {Number(paymentAmount) > totals.total && totals.total > 0 && (
              <div style={{ fontSize: 12, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '8px 12px' }}>
                💰 초과 금액은 예치금으로 처리됩니다.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 저장 버튼 */}
      <div style={s.footer}>
        <button
          style={isPending || isSubmitting || !lines.length ? s.btnOff : s.btn}
          onClick={handleSubmit}
          disabled={isPending || isSubmitting || !lines.length}>
          {isPending ? '저장 중...' : `주문 등록${lines.length ? ` (${formatKRW(totals.total)})` : ''}`}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 스타일
// ============================================================

const s: Record<string, React.CSSProperties> = {
  wrap:             { maxWidth: 960, margin: '0 auto', padding: '28px 24px 48px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif' },
  titleBar:         { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' },
  titleText:        { fontSize: 18, fontWeight: 600 },
  customerBadge:    { background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20 },
  errBox:           { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  okBox:            { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  warnBox:          { background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#B45309', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  warnClose:        { background: 'none', border: 'none', color: '#B45309', cursor: 'pointer', fontSize: 18 },
  topRow:           { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' },
  field:            { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16, flex: 1 },
  label:            { fontSize: 11, fontWeight: 500, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase' },
  loading:          { color: '#9ca3af', fontWeight: 400 },
  rel:              { position: 'relative' },
  input:            { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' },
  dd:               { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', zIndex: 50, maxHeight: 320, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 },
  ddItem:           { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f9fafb' },
  pill:             { marginLeft: 'auto', fontSize: 11, padding: '2px 7px', borderRadius: 12, background: '#FEF3C7', color: '#92400E' },
  pillGray:         { fontSize: 11, padding: '2px 7px', borderRadius: 12, background: '#F3F4F6', color: '#6b7280' },
  prevBadge:        { marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#DCFCE7', color: '#15803D', fontWeight: 500 },
  pCode:            { fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', minWidth: 76 },
  pName:            { flex: 1 },
  pPrice:           { marginLeft: 'auto', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  tableWrap:        { border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto', marginBottom: 12 },
  table:            { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:               { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  tr:               {},
  refundRow:        { background: '#FFF5F5' },
  td:               { padding: '8px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
  num:              { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151' },
  pCell:            { display: 'flex', flexDirection: 'column', gap: 2 },
  pCellName:        { fontWeight: 500 },
  pCellCode:        { fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' },
  qtyInput:         { width: 72, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, textAlign: 'center', outline: 'none' },
  priceInput:       { width: 108, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none', transition: 'border-color 0.15s' },
  modeBadge:        { fontSize: 9, color: '#6366f1', fontWeight: 600, textAlign: 'right', marginTop: 2 },
  marginBad:        { color: '#DC2626', fontWeight: 500 },
  marginOk:         { color: '#16A34A' },
  rmBtn:            { background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 13, padding: '3px 6px', borderRadius: 4 },
  totalsBar:        { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  totalLabel:       { color: '#6b7280' },
  totalVal:         { fontVariantNumeric: 'tabular-nums', marginRight: 4 },
  sep:              { color: '#e5e7eb' },
  totalBig:         { fontSize: 20, fontWeight: 700, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' },
  paymentFailBanner:{ background: '#FEF2F2', border: '2px solid #EF4444', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, color: '#B91C1C', marginBottom: 12 },
  payNowBtn:        { padding: '10px 16px', background: '#B91C1C', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 },
  footer:           { display: 'flex', justifyContent: 'flex-end', paddingTop: 4 },
  btn:              { padding: '13px 32px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnOff:           { padding: '13px 32px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
}