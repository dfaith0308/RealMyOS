'use client'

import { useState, useEffect, useTransition, useRef, useCallback, useMemo } from 'react'
import { createOrder, getCustomersForOrder, getProductsForOrder } from '@/actions/order'
import { createPayment } from '@/actions/payment'
import type { PaymentMethod } from '@/actions/payment'
import { calcMarginRate, formatKRW, todayStr } from '@/lib/calc'
import type { CustomerForOrder, ProductForOrder, OrderLineInput } from '@/types/order'

// ============================================================
// 타입
// ============================================================

interface LineItem {
  uid:              string
  product:          ProductForOrder
  quantity:         number
  unit_price_input: string   // 단가 입력값 (소수 가능, 표시용)
  total_input:      string   // 총액 입력값 (정수 문자열)
  mode:             'unit' | 'total'
}

// ============================================================
// ResolveLine — 유일한 진실값 계산 함수
// UI 표시 / 하단 합계 / 저장 payload 전부 이것만 사용
// unit_price × qty는 이 함수 외부에서 절대 쓰지 않음
// ============================================================

interface ResolvedLine {
  quantity:     number
  unit_price:   number    // 참고값 (표시용)
  line_total:   number    // 진실값
  supply_price: number    // line_total 기준 계산
  vat_amount:   number    // line_total 기준 계산
  margin_rate:  number    // line_total 기준 계산
}

function resolveLine(line: LineItem): ResolvedLine {
  const qty = line.quantity

  // ── line_total 결정 ──
  // mode=total: 사용자 입력 총액 그대로
  // mode=unit:  unit_price × qty (정수 × 정수, 오차 없음)
  let line_total: number
  let unit_price: number

  if (line.mode === 'total') {
    const raw = parseInt(line.total_input.replace(/[^0-9]/g, ''), 10) || 0
    line_total = qty < 0 ? -raw : raw
    unit_price = qty === 0 ? 0 : Math.floor(Math.abs(line_total) / Math.abs(qty))
  } else {
    unit_price = Math.round(parseFloat(line.unit_price_input) || 0)
    line_total = unit_price * qty
  }

  // ── 공급가 / 부가세 — line_total 기준 ──
  const abs  = Math.abs(line_total)
  const sign = line_total < 0 ? -1 : 1
  let supply_price: number
  let vat_amount: number

  if (line.product.tax_type === 'taxable') {
    supply_price = sign * Math.round(abs / 1.1)
    vat_amount   = line_total - supply_price
  } else {
    supply_price = line_total
    vat_amount   = 0
  }

  // ── 마진율 — line_total 기준 ──
  const cost_total = line.product.current_cost_price * Math.abs(qty)
  const margin_rate = abs > 0
    ? ((abs - cost_total) / abs) * 100
    : 0

  // 세금 계산 검증 — supply + vat === line_total 보장
  if (supply_price + vat_amount !== line_total) {
    console.error('[TAX-MISMATCH]', { line_total, supply_price, vat_amount, diff: line_total - supply_price - vat_amount })
    // 부가세 보정: line_total이 진실값이므로 vat를 맞춤
    vat_amount = line_total - supply_price
  }

  return { quantity: qty, unit_price, line_total, supply_price, vat_amount, margin_rate }
}

// ── 하단 합계 — resolveLine 기반 ─────────────────────────────
function calcTotals(lines: LineItem[]) {
  return lines.reduce(
    (acc, l) => {
      const r = resolveLine(l)
      return { supply: acc.supply + r.supply_price, vat: acc.vat + r.vat_amount, total: acc.total + r.line_total }
    },
    { supply: 0, vat: 0, total: 0 },
  )
}

// ── 저장 payload — resolveLine 기반 ──────────────────────────
function toOrderLineInput(l: LineItem): OrderLineInput {
  const r = resolveLine(l)
  return {
    product_id:          l.product.id,
    product_code:        l.product.product_code,
    product_name:        l.product.name,
    quantity:            r.quantity,
    unit_price:          r.unit_price,
    cost_price:          l.product.current_cost_price,
    tax_type:            l.product.tax_type,
    fulfillment_type:    l.product.fulfillment_type,
    line_total_override: l.mode === 'total' ? r.line_total : undefined,
  }
}

// ── UI 표시용 단가 / 총액 ──────────────────────────────────────

function displayUnit(line: LineItem): string {
  if (line.mode === 'unit') return line.unit_price_input
  const qty = Math.abs(line.quantity)
  if (qty === 0 || !line.total_input) return ''
  const total = parseInt(line.total_input, 10) || 0
  if (total === 0) return ''
  const unit = total / qty
  return Number.isInteger(unit) ? String(unit) : unit.toFixed(2)
}

function displayTotal(line: LineItem): string {
  if (line.mode === 'total') return line.total_input
  const r = resolveLine(line)
  return r.line_total !== 0 ? String(Math.abs(r.line_total)) : ''
}

// ============================================================
// 상품 정렬 — 거래처 구매이력 상단
// ============================================================

function sortByPurchaseHistory(products: ProductForOrder[]): ProductForOrder[] {
  return [...products].sort((a, b) => {
    if (a.has_purchase_history && !b.has_purchase_history) return -1
    if (!a.has_purchase_history && b.has_purchase_history) return 1
    return a.name.localeCompare(b.name)
  })
}

// ============================================================
// 컴포넌트
// ============================================================

interface OrderCreateFormProps {
  initialCustomerId?: string
  reorderLines?: Array<{
    product_id: string; product_name: string; product_code: string
    quantity: number; unit_price: number; tax_type?: string
  }>
}

export default function OrderCreateForm({ initialCustomerId, reorderLines }: OrderCreateFormProps = {}) {
  const [isPending, startTransition] = useTransition()

  const [customers,       setCustomers]       = useState<CustomerForOrder[]>([])
  const [products,        setProducts]        = useState<ProductForOrder[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)
  const [customerQuery,    setCustomerQuery]    = useState('')
  const [showCustomerDd,   setShowCustomerDd]   = useState(false)
  const [customerHiIdx,    setCustomerHiIdx]    = useState(0)

  const [productQuery,  setProductQuery]  = useState('')
  const [showProductDd, setShowProductDd] = useState(false)

  const [lines,        setLines]        = useState<LineItem[]>([])
  const [orderDate,    setOrderDate]    = useState(todayStr())
  const [dateError,     setDateError]     = useState('')
  const [paymentDateError, setPaymentDateError] = useState('')
  const [memo,         setMemo]         = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const productRef = useRef<HTMLInputElement>(null)

  const [discountAmount, setDiscountAmount] = useState('')   // 기간할인
  const [pointUsed,      setPointUsed]      = useState('')   // 적립금 사용
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
      setProducts(sortByPurchaseHistory(r.data ?? []))
      setLoadingProducts(false)
      if (reorderLines?.length) {
        const sorted = sortByPurchaseHistory(r.data ?? [])
        const mapped = reorderLines.flatMap((rl) => {
          const prod = sorted.find((p) => p.id === rl.product_id)
          if (!prod) return []
          const snap = rl.tax_type ? { ...prod, tax_type: rl.tax_type as 'taxable' | 'exempt' } : prod
          return [{
            uid: crypto.randomUUID(), product: snap, quantity: rl.quantity,
            unit_price_input: String(rl.unit_price),
            total_input: '',  // resolveLine이 unit_price_input 기준 재계산
            mode: 'unit' as const,
          }]
        })
        if (mapped.length) setLines(mapped)
      }
    })
  }, [selectedCustomer, reorderLines])

  // ── 합계 (렌더마다 재계산 — resolveLine 기반) ─────────────

  const totals = useMemo(() => calcTotals(lines), [lines])

  // orders 레벨 할인/적립금 — 실시간 클램핑으로 음수 불가
  const discountRaw = Math.max(0, parseInt(discountAmount, 10) || 0)
  const discountNum = Math.min(discountRaw, totals.total)                    // total 초과 차단
  const pointRaw    = Math.max(0, parseInt(pointUsed, 10)      || 0)
  const pointNum    = Math.min(pointRaw, totals.total - discountNum)         // 잔액 초과 차단
  const finalAmount = totals.total - discountNum - pointNum                  // 항상 >= 0

  useEffect(() => {
    // 수금 체크 상태에서 금액 변경 시 자동 동기화 (현재 주문 기준만)
    if (doPayment) {
      setPaymentAmount(finalAmount > 0 ? String(finalAmount) : '')
    }
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

  // ── 금액 상태 전체 초기화 — carry-over 절대 금지 ──────────
  const resetFinancialState = useCallback(() => {
    setDiscountAmount('')
    setPointUsed('')
    setDoPayment(false)
    setPaymentAmount('')
    setPaymentDateP(todayStr())
    setPaymentError(null)
    setPaymentFailed(null)
    setPaymentWarning(null)
  }, [])

  const selectCustomer = useCallback((c: CustomerForOrder) => {
    setSelectedCustomer(c); setCustomerQuery(c.name)
    setShowCustomerDd(false); setLines([]); setError(null)
    resetFinancialState()  // 거래처 변경 시 금액 초기화
    setTimeout(() => productRef.current?.focus(), 80)
  }, [])

  // ── 상품 추가 ─────────────────────────────────────────────

  const addProduct = useCallback((p: ProductForOrder) => {
    let mode: 'unit' | 'total' = 'unit'
    let unit_price_input = ''
    let total_input      = ''
    let quantity         = 1

    if (p.has_purchase_history && p.last_pricing_mode) {
      // 과거 거래 방식 그대로 복원
      if (p.last_pricing_mode === 'total' && p.last_line_total != null) {
        mode             = 'total'
        total_input      = String(Math.abs(p.last_line_total))
        unit_price_input = ''
        quantity         = p.last_qty ?? 1
      } else if (p.last_pricing_mode === 'unit') {
        mode             = 'unit'
        unit_price_input = String(p.last_unit_price)
        total_input      = ''  // resolveLine이 unit_price_input 기준으로 재계산
        quantity         = p.last_qty ?? 1
      }
    } else if (p.has_purchase_history && p.last_unit_price > 0) {
      // 구 데이터 — pricing_mode 없으면 unit으로 간주
      mode             = 'unit'
      unit_price_input = String(p.last_unit_price)
      total_input      = ''  // resolveLine이 재계산
      quantity         = 1
    }
    // 구매 이력 없음 → 빈 값

    setLines((prev) => [...prev, {
      uid: crypto.randomUUID(), product: p,
      quantity, unit_price_input, total_input, mode,
    }])
    setProductQuery(''); setShowProductDd(false)
    productRef.current?.focus()
  }, [])

  // ── 라인 수정 — 단방향, 무한루프 없음 ────────────────────

  const updateQuantity = useCallback((uid: string, rawVal: string) => {
    const qty = parseInt(rawVal, 10)
    if (isNaN(qty)) return
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      if (l.mode === 'unit') {
        const unit  = parseFloat(l.unit_price_input) || 0
        const total = Math.round(Math.abs(qty) * unit)
        return { ...l, quantity: qty, total_input: total > 0 ? String(total) : '' }
      }
      return { ...l, quantity: qty }  // mode=total: total 고정, unit 표시는 displayUnit에서 파생
    }))
  }, [])

  const updateUnitPrice = useCallback((uid: string, value: string) => {
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      const unit  = parseFloat(value) || 0
      const total = Math.round(Math.abs(l.quantity) * unit)
      return { ...l, mode: 'unit', unit_price_input: value, total_input: total > 0 ? String(total) : '' }
    }))
  }, [])

  const updateTotalAmount = useCallback((uid: string, value: string) => {
    const numeric = value.replace(/[^0-9]/g, '')
    setLines((prev) => prev.map((l) => {
      if (l.uid !== uid) return l
      return { ...l, mode: 'total', total_input: numeric, unit_price_input: '' }
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
    // 날짜 검증
    if (!validateDate(orderDate)) {
      setDateError('날짜를 올바르게 입력해주세요.')
      return
    }

    const zeroQty = lines.find((l) => l.quantity === 0)
    if (zeroQty) { setError(`[${zeroQty.product.name}] 수량을 입력해주세요.`); return }

    // 입력값 강제 검증 — 1원 오차도 허용하지 않음
    for (const l of lines) {
      const r = resolveLine(l)

      // line_total 유효성
      if (!r.line_total || r.line_total === 0) {
        setError(`[${l.product.name}] 금액을 입력해주세요.`)
        return
      }
      if (r.line_total < 0 && l.quantity > 0) {
        setError(`[${l.product.name}] 금액이 음수입니다. 수량이 음수인 경우 반품으로 처리해주세요.`)
        return
      }

      // 세금 검증: supply + vat === line_total 강제
      if (r.supply_price + r.vat_amount !== r.line_total) {
        console.error('[TAX MISMATCH]', {
          product: l.product.name,
          line_total: r.line_total,
          supply: r.supply_price,
          vat: r.vat_amount,
          diff: r.line_total - r.supply_price - r.vat_amount,
        })
        setError(`[${l.product.name}] 세금 계산 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.`)
        return
      }
    }

    // 디버깅 로그 + 총액 불일치 강제 검증
    const resolvedLines = lines.map((l) => ({ product: l.product.name, mode: l.mode, qty: l.quantity, resolved: resolveLine(l) }))
    console.log('[ORDER-LINE-DEBUG]', resolvedLines)
    console.log('[ORDER-SUMMARY-DEBUG]', { supply: totals.supply, vat: totals.vat, total: totals.total })

    const verifyTotal = resolvedLines.reduce((sum, l) => sum + l.resolved.line_total, 0)
    if (verifyTotal !== totals.total) {
      console.error('[TOTAL MISMATCH]', { verifyTotal, displayedTotal: totals.total })
      setError(`금액 불일치 오류: 계산값 ${verifyTotal} ≠ 표시값 ${totals.total}`)
      setIsSubmitting(false)
      return
    }

    // 할인/적립금 검증 (클램핑 후에도 한 번 더 확인)
    if (isNaN(discountNum) || isNaN(pointNum)) { setError('할인/적립금 값이 올바르지 않습니다.'); return }
    if (discountNum > totals.total) { setError(`기간할인이 주문금액을 초과합니다.`); return }
    if (pointNum > totals.total - discountNum) { setError(`적립금이 할인 후 잔액을 초과합니다.`); return }
    if (finalAmount < 0) { setError('결제금액이 0 미만입니다.'); return }
    if (finalAmount !== totals.total - discountNum - pointNum) {
      setError('[FINAL_MISMATCH] 금액 계산 오류. 새로고침 후 다시 시도해주세요.')
      return
    }

    // 수금 금액 초과 차단
    if (doPayment) {
      const collectAmt = Math.round(Number(paymentAmount) || 0)
      if (collectAmt > finalAmount) {
        setError(`수금 금액(${collectAmt.toLocaleString()})이 결제금액(${finalAmount.toLocaleString()})을 초과합니다.`)
        return
      }
    }

    setError(null); setSuccess(null); setIsSubmitting(true)

    const lineInputs = lines.map(toOrderLineInput)

    startTransition(async () => {
      const res = await createOrder({
        customer_id:     selectedCustomer.id,
        order_date:      orderDate,
        memo:            memo || undefined,
        lines:           lineInputs,
        discount_amount: discountNum,
        point_used:      pointNum,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? '저장 실패'); setIsSubmitting(false); return
      }

      let successMsg = `✓ ${res.data.order_number} 등록 완료 — ${formatKRW(res.data.final_amount ?? res.data.total_amount)}`

      if (doPayment) {
        const amt = Math.round(Number(paymentAmount))
        if (amt > 0) {
          const pr = await createPayment({
            customer_id:    selectedCustomer.id,
            amount:         amt,
            payment_date:   paymentDate,
            payment_method: paymentMethod,
          })
          if (pr.success && pr.data) {
            const dep  = pr.data.deposit_amount
            const mode = pr.data.mode === 'fallback' ? ' (직접저장)' : ''
            successMsg += dep > 0
              ? ` | 수금 완료${mode} · 예치금 +${formatKRW(dep)}`
              : ` | 수금 완료${mode}`
            setPaymentError(null); setPaymentFailed(null)
            setPaymentWarning(pr.data.warning ?? null)
          } else {
            // ⚠️ 수금 실패 — 주문은 저장됐지만 수금은 저장 안 됨을 명확히 표시
            setPaymentFailed({ orderId: res.data!.order_id, customerId: selectedCustomer.id, amount: amt })
            setPaymentError(pr.error ?? '알 수 없는 오류')
            // success 메시지를 경고로 바꿔 사용자가 수금 실패를 인지하게 함
            setSuccess(null)
            setError(`주문(${res.data!.order_number})은 저장됐으나 수금이 실패했습니다. 아래 버튼으로 수금을 재시도하세요.
사유: ${pr.error ?? '알 수 없는 오류'}`)
            setIsSubmitting(false)
            return  // successMsg 설정 없이 종료
          }
        }
      }

      setSuccess(successMsg)
      setLines([]); setMemo('')
      resetFinancialState()  // 주문 완료 후 전체 금액 초기화
      setIsSubmitting(false)
    })
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseDateValue(e.target.value)
    setOrderDate(parsed)
    if (dateError) setDateError('')
  }

  function parseDateValue(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits.length === 8)
      return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
    return raw
  }

  function validateDate(value: string): boolean {
    if (!value) return false
    const d = new Date(value)
    return !isNaN(d.getTime())
  }

  function handlePaymentDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseDateValue(e.target.value)
    setPaymentDateP(parsed)
    if (paymentDateError) setPaymentDateError('')
  }

  function handlePaymentDateBlur() {
    if (!paymentDate) return
    if (!validateDate(paymentDate)) {
      setPaymentDateError('잘못된 날짜입니다.')
    } else {
      setPaymentDateError('')
    }
  }

  function handleDateBlur() {
    if (!orderDate) return
    if (!validateDate(orderDate)) {
      setDateError('잘못된 날짜 형식입니다. YYYY-MM-DD 또는 YYYYMMDD로 입력해주세요.')
    } else {
      setDateError('')
    }
    // 값 절대 변경하지 않음
  }

  function handleCustomerKeyDown(e: React.KeyboardEvent) {
    const list = filteredCustomers.slice(0, 8)
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustomerHiIdx((p) => Math.min(p + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustomerHiIdx((p) => Math.max(p - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = list[customerHiIdx]
      if (selected) selectCustomer(selected)
    } else if (e.key === 'Escape') {
      setShowCustomerDd(false)
    }
  }

  function handleProductKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && filteredProducts.length > 0) { e.preventDefault(); addProduct(filteredProducts[0]) }
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
          <span style={{ fontSize: 11, color: '#15803D', marginTop: 4, display: 'block' }}>잠시 후 주문 목록으로 이동합니다...</span>
        </div>
      )}

      {/* 상단 입력 */}
      <div style={s.topRow}>
        <div style={{ ...s.field, flex: 2 }}>
          <label style={s.label}>거래처 *</label>
          <div style={s.rel}>
            <input style={s.input} placeholder="거래처명 검색... (↑↓ 이동, Enter 선택)"
              value={customerQuery}
              onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerDd(true); setCustomerHiIdx(0) }}
              onFocus={() => setShowCustomerDd(true)}
              onBlur={() => setTimeout(() => setShowCustomerDd(false), 150)}
              onKeyDown={handleCustomerKeyDown}
              autoComplete="off" />
            {showCustomerDd && filteredCustomers.length > 0 && (
              <ul style={s.dd}>
                {filteredCustomers.slice(0, 8).map((c, idx) => (
                  <li key={c.id}
                    style={{ ...s.ddItem, background: idx === customerHiIdx ? '#EFF6FF' : undefined }}
                    onMouseDown={() => selectCustomer(c)}
                    onMouseEnter={() => setCustomerHiIdx(idx)}>
                    <span>{c.name}</span>
                    {c.payment_terms_days > 0 && <span style={s.pill}>{c.payment_terms_days}일 외상</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{ ...s.field, flex: 1, maxWidth: 168 }}>
          <label style={s.label}>주문일</label>
          <div style={{ position: 'relative' }}>
            <input type="text"
              style={{ ...s.input, borderColor: dateError ? '#EF4444' : undefined, paddingRight: 32 }}
              value={orderDate}
              onChange={handleDateChange}
              onBlur={handleDateBlur}
              placeholder="YYYY-MM-DD 또는 YYYYMMDD"
              maxLength={10} />
            <input type="date"
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, opacity: 0, cursor: 'pointer' }}
              value={validateDate(orderDate) ? orderDate : ''}
              onChange={(e) => { if (e.target.value) { setOrderDate(e.target.value); setDateError('') } }} />
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', color: '#9ca3af' }}>📅</span>
          </div>
          {dateError && (
            <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{dateError}</div>
          )}
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
                  const hasPrev = p.has_purchase_history
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
                      <span style={s.pPrice}>{hasPrev ? formatKRW(p.last_unit_price) : ''}</span>
                      {p.tax_type === 'exempt' && <span style={s.pillGray}>면세</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 주문 라인 — resolveLine 기반 */}
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
                const r        = resolveLine(line)  // 유일한 계산 진실값
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
                      <input type="number" style={s.qtyInput}
                        value={line.quantity || ''}
                        step={1}
                        onChange={(e) => updateQuantity(line.uid, e.target.value)} />
                    </td>
                    {/* 단가 */}
                    <td style={s.td}>
                      <input type="text" inputMode="decimal"
                        style={{ ...s.priceInput, borderColor: line.mode === 'unit' ? '#6366f1' : '#e5e7eb' }}
                        value={displayUnit(line)}
                        onChange={(e) => updateUnitPrice(line.uid, e.target.value)}
                        placeholder="단가" />
                      {line.mode === 'unit' && <div style={s.modeBadge}>기준</div>}
                    </td>
                    {/* 총액 */}
                    <td style={s.td}>
                      <input type="text" inputMode="numeric"
                        style={{ ...s.priceInput, borderColor: line.mode === 'total' ? '#6366f1' : '#e5e7eb' }}
                        value={displayTotal(line)}
                        onChange={(e) => updateTotalAmount(line.uid, e.target.value)}
                        placeholder="총액" />
                      {line.mode === 'total' && (
                        <div style={{ ...s.modeBadge, color: '#059669' }}
                          title="총액이 기준입니다. 단가는 표시용이며, 일부 단가는 ±1원 보정될 수 있습니다.">
                          총액기준 ⓘ
                        </div>
                      )}
                    </td>
                    {/* 공급가 / 부가세 / 합계 — 전부 r 기반 */}
                    <td style={{ ...s.td, ...s.num }}>{r.supply_price.toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.num }}>{r.vat_amount.toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.num, fontWeight: 500 }}>{r.line_total.toLocaleString()}</td>
                    <td style={{ ...s.td, ...s.num }}>
                      <span style={r.margin_rate < 5 ? s.marginBad : s.marginOk}>
                        {r.margin_rate.toFixed(1)}%
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

      {/* 하단 합계 */}
      {lines.length > 0 && (
        <>
          <div style={s.totalsBar}>
            <span style={s.totalLabel}>공급가</span>
            <span style={s.totalVal}>{formatKRW(totals.supply)}</span>
            <span style={s.sep}>|</span>
            <span style={s.totalLabel}>부가세</span>
            <span style={s.totalVal}>{formatKRW(totals.vat)}</span>
            <span style={s.sep}>|</span>
            <span style={s.totalLabel}>상품합계</span>
            <span style={s.totalBig}>{formatKRW(totals.total)}</span>
          </div>

          {/* 할인/적립금 입력 */}
          <div style={s.discountRow}>
            <div style={s.discountField}>
              <label style={s.discountLabel}>기간할인</label>
              <input
                type="number" min={0} style={s.discountInput}
                placeholder="0"
                value={discountAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '')
                  const n = parseInt(v, 10) || 0
                  if (n > totals.total) {
                    setDiscountAmount(String(totals.total))
                  } else {
                    setDiscountAmount(v)
                  }
                }}
              />
            </div>
            <div style={s.discountField}>
              <label style={s.discountLabel}>적립금 사용</label>
              <input
                type="number" min={0} style={s.discountInput}
                placeholder="0"
                value={pointUsed}
                onChange={(e) => {
                  const v  = e.target.value.replace(/[^0-9]/g, '')
                  const n  = parseInt(v, 10) || 0
                  const maxPoint = Math.max(0, totals.total - discountNum)
                  if (n > maxPoint) {
                    setPointUsed(String(maxPoint))
                  } else {
                    setPointUsed(v)
                  }
                }}
              />
            </div>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <span style={s.totalLabel}>결제금액</span>
              <span style={{
                ...s.totalBig,
                color: finalAmount < 0 ? '#DC2626' : '#111827',
                marginLeft: 0,
              }}>
                {formatKRW(finalAmount)}
              </span>
              {(discountNum > 0 || pointNum > 0) && (
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  ({formatKRW(totals.total)} - {formatKRW(discountNum + pointNum)})
                </span>
              )}
            </div>
          </div>
        </>
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
              const checked = e.target.checked
              setDoPayment(checked)
              if (checked) {
                // 현재 주문 finalAmount 기준으로만 자동 입력
                setPaymentAmount(finalAmount > 0 ? String(finalAmount) : '')
              } else {
                setPaymentAmount('')  // 체크 해제 시 반드시 초기화
              }
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
                <div style={{ position: 'relative' }}>
                  <input type="text"
                    style={{ ...s.input, paddingRight: 32, borderColor: paymentDateError ? '#EF4444' : undefined }}
                    value={paymentDate}
                    onChange={handlePaymentDateChange}
                    onBlur={handlePaymentDateBlur}
                    placeholder="YYYY-MM-DD 또는 YYYYMMDD"
                    maxLength={10} />
                  <input type="date"
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, opacity: 0, cursor: 'pointer' }}
                    value={validateDate(paymentDate) ? paymentDate : ''}
                    onChange={(e) => { if (e.target.value) { setPaymentDateP(e.target.value); setPaymentDateError('') } }} />
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', color: '#9ca3af' }}>📅</span>
                </div>
                {paymentDateError && (
                  <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{paymentDateError}</div>
                )}
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
          {isPending ? '저장 중...' : `주문 등록${lines.length ? ` (${formatKRW(finalAmount)})` : ''}`}
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
  discountRow:      { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f9fafb', borderRadius: 8, marginBottom: 16, flexWrap: 'wrap' },
  discountField:    { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 },
  discountLabel:    { fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', fontWeight: 500 },
  discountInput:    { width: 120, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' },
  btn:              { padding: '13px 32px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnOff:           { padding: '13px 32px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
}