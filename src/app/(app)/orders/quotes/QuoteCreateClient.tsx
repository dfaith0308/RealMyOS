'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createQuote, createProspectCustomer } from '@/actions/quote'
import { getProductsForOrder } from '@/actions/order'
import { formatKRW, todayStr } from '@/lib/calc'
import type { CustomerForOrder, ProductForOrder } from '@/types/order'
import type { CreateQuoteItemInput } from '@/types/quote'

interface QuoteLine {
  uid:              string
  product:          ProductForOrder
  quantity:         number
  unit_price_input: string
  total_input:      string
  mode:             'unit' | 'total'
}

function resolveQuoteLine(line: QuoteLine): { quoted_price: number; line_total: number } {
  if (line.mode === 'total') {
    const total = parseInt(line.total_input.replace(/[^0-9]/g, ''), 10) || 0
    const signedTotal = line.quantity < 0 ? -total : total
    const quoted_price = line.quantity === 0 ? 0 : Math.floor(Math.abs(signedTotal) / Math.abs(line.quantity))
    return { quoted_price, line_total: signedTotal }
  }
  const quoted_price = Math.round(parseFloat(line.unit_price_input) || 0)
  return { quoted_price, line_total: quoted_price * line.quantity }
}

export default function QuoteCreateClient({ initialCustomers }: { initialCustomers: CustomerForOrder[] }) {
  const router = useRouter()
  const [customers] = useState(initialCustomers)
  const [products, setProducts] = useState<ProductForOrder[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)
  const [customerQuery, setCustomerQuery]       = useState('')
  const [showCustomerDd, setShowCustomerDd]     = useState(false)
  const [customerHiIdx, setCustomerHiIdx]       = useState(0)

  const [productQuery, setProductQuery]   = useState('')
  const [showProductDd, setShowProductDd] = useState(false)

  const [lines, setLines]           = useState<QuoteLine[]>([])
  const [expiresAt, setExpiresAt]   = useState('')
  const [memo, setMemo]             = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const productRef = useRef<HTMLInputElement>(null)

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerQuery.toLowerCase())
  )
  const filteredProducts = products.filter(
    (p) => !lines.find((l) => l.product.id === p.id) &&
      (p.name.includes(productQuery) || p.product_code.includes(productQuery))
  )

  const totals = useMemo(() => lines.reduce((acc, l) => {
    const r = resolveQuoteLine(l)
    return { total: acc.total + r.line_total }
  }, { total: 0 }), [lines])

  const selectCustomer = useCallback((c: CustomerForOrder) => {
    setSelectedCustomer(c); setCustomerQuery(c.name); setShowCustomerDd(false); setLines([])
    setLoadingProducts(true)
    getProductsForOrder(c.id).then((r) => {
      setProducts(r.data ?? [])
      setLoadingProducts(false)
      setTimeout(() => productRef.current?.focus(), 80)
    })
  }, [])

  const addProduct = useCallback((p: ProductForOrder) => {
    const unitPrice = p.has_purchase_history ? p.last_unit_price : 0
    setLines((prev) => [...prev, {
      uid: crypto.randomUUID(), product: p, quantity: 1,
      unit_price_input: unitPrice > 0 ? String(unitPrice) : '',
      total_input: unitPrice > 0 ? String(unitPrice) : '',
      mode: 'unit',
    }])
    setProductQuery(''); setShowProductDd(false)
    productRef.current?.focus()
  }, [])

  async function handleCreateProspect() {
    if (!prospectName.trim()) return
    setCreatingProspect(true)
    const res = await createProspectCustomer(prospectName, prospectPhone)
    if (res.success && res.data) {
      const newCustomer: CustomerForOrder = {
        id: res.data.customer_id,
        name: prospectName.trim(),
        payment_terms_days: 0,
      }
      selectCustomer(newCustomer)
      setShowProspect(false); setProspectName(''); setProspectPhone('')
      if (res.data.existed) {
        setError('동일한 연락처의 기존 거래처로 선택됐습니다.')
        setTimeout(() => setError(null), 3000)
      }
    } else {
      setError(res.error ?? '거래처 생성 실패')
    }
    setCreatingProspect(false)
  }

  function handleCustomerKeyDown(e: React.KeyboardEvent) {
    const list = filteredCustomers.slice(0, 8)
    if (!list.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCustomerHiIdx((p) => Math.min(p + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCustomerHiIdx((p) => Math.max(p - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const s = list[customerHiIdx]; if (s) selectCustomer(s) }
    else if (e.key === 'Escape') setShowCustomerDd(false)
  }

  function handleProductKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && filteredProducts.length > 0) { e.preventDefault(); addProduct(filteredProducts[0]) }
    if (e.key === 'Escape') setShowProductDd(false)
  }

  async function handleSubmit() {
    if (submitting || !selectedCustomer || !lines.length) return
    setSubmitting(true); setError(null)

    const items: CreateQuoteItemInput[] = lines.map((l) => {
      const r = resolveQuoteLine(l)
      return {
        product_id: l.product.id, product_code: l.product.product_code,
        product_name: l.product.name, quantity: l.quantity,
        quoted_price: r.quoted_price, tax_type: l.product.tax_type,
        line_total: r.line_total, pricing_mode: l.mode,
      }
    })

    const res = await createQuote({
      customer_id: selectedCustomer.id, items,
      expires_at: expiresAt || undefined, memo: memo || undefined,
    })

    if (res.success) {
      router.push(`/orders/quotes/${res.data!.quote_id}`)
    } else {
      setError(res.error ?? '저장 실패')
      setSubmitting(false)
    }
  }

  const s = styles
  return (
    <div style={s.wrap}>
      <div style={s.titleBar}>
        <span style={s.title}>견적 등록</span>
        {selectedCustomer && <span style={s.badge}>{selectedCustomer.name}</span>}
      </div>

      {error && <div style={s.err}>{error}</div>}

      {/* 예비거래처 등록 폼 */}
      {showProspect && (
        <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, padding: 16, marginBottom: 16, background: '#EFF6FF' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8', marginBottom: 12 }}>예비거래처 등록</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...s.input, flex: 2 }} placeholder="거래처명 *"
              value={prospectName} onChange={(e) => setProspectName(e.target.value)} />
            <input style={{ ...s.input, flex: 1 }} placeholder="전화번호 (선택)"
              value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowProspect(false)}
              style={{ padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
            <button onClick={handleCreateProspect} disabled={!prospectName.trim() || creatingProspect}
              style={{ padding: '7px 14px', background: creatingProspect ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
              {creatingProspect ? '생성 중...' : '거래처 생성 후 선택'}
            </button>
          </div>
        </div>
      )}

      {/* 거래처 */}
      <div style={s.topRow}>
        <div style={{ flex: 2, position: 'relative' }}>
          <label style={s.label}>거래처 *</label>
          <div style={{ position: 'relative' }}>
            <input style={s.input} placeholder="거래처명 검색..."
              value={customerQuery}
              onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerDd(true); setCustomerHiIdx(0) }}
              onFocus={() => setShowCustomerDd(true)}
              onBlur={() => setTimeout(() => setShowCustomerDd(false), 150)}
              onKeyDown={handleCustomerKeyDown} autoComplete="off" />
            {showCustomerDd && (
              <ul style={s.dd}>
                {filteredCustomers.slice(0, 8).map((c, idx) => (
                  <li key={c.id}
                    style={{ ...s.ddItem, background: idx === customerHiIdx ? '#EFF6FF' : undefined }}
                    onMouseDown={() => selectCustomer(c)}
                    onMouseEnter={() => setCustomerHiIdx(idx)}>
                    {c.name}
                  </li>
                ))}
                <li style={{ ...s.ddItem, color: '#2563EB', borderTop: '1px solid #e5e7eb', fontSize: 13 }}
                  onMouseDown={(e) => { e.preventDefault(); setShowCustomerDd(false); setShowProspect(true); setProspectName(customerQuery) }}>
                  + 예비거래처로 등록: "{customerQuery}"
                </li>
              </ul>
            )}
          </div>
        </div>
        <div style={{ flex: 1, maxWidth: 168 }}>
          <label style={s.label}>유효기간</label>
          <input style={s.input} type="date" value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)} placeholder="선택사항" />
        </div>
      </div>

      {/* 상품 검색 */}
      {selectedCustomer && (
        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>상품 추가{loadingProducts && ' (불러오는 중...)'}</label>
          <div style={{ position: 'relative' }}>
            <input ref={productRef} style={s.input}
              placeholder="상품명·코드 검색 — Enter로 첫 번째 선택"
              value={productQuery}
              onChange={(e) => { setProductQuery(e.target.value); setShowProductDd(true) }}
              onFocus={() => setShowProductDd(true)}
              onBlur={() => setTimeout(() => setShowProductDd(false), 150)}
              onKeyDown={handleProductKeyDown} autoComplete="off" disabled={loadingProducts} />
            {showProductDd && filteredProducts.length > 0 && (
              <ul style={s.dd}>
                {filteredProducts.slice(0, 10).map((p) => (
                  <li key={p.id} style={s.ddItem} onMouseDown={() => addProduct(p)}>
                    <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', minWidth: 70 }}>{p.product_code}</span>
                    <span style={{ flex: 1 }}>{p.name}{p.has_purchase_history && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 8, background: '#DCFCE7', color: '#15803D' }}>최근</span>}</span>
                    {p.tax_type === 'exempt' && <span style={{ fontSize: 10, color: '#6b7280' }}>면세</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 라인 테이블 */}
      {lines.length > 0 && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['상품', '수량', '단가', '총액', '합계', ''].map((h) => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const r = resolveQuoteLine(line)
                return (
                  <tr key={line.uid} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{line.product.name}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{line.product.product_code}</div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input type="number" style={{ width: 64, padding: '5px 7px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                        value={line.quantity}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value, 10)
                          if (!isNaN(qty)) setLines((prev) => prev.map((l) => l.uid === line.uid ? { ...l, quantity: qty } : l))
                        }} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input type="text" style={{ width: 100, padding: '5px 7px', border: `1px solid ${line.mode === 'unit' ? '#6366f1' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                        value={line.mode === 'unit' ? line.unit_price_input : (line.quantity > 0 ? String(Math.floor(Math.abs(r.line_total) / line.quantity)) : '')}
                        onChange={(e) => {
                          const v = e.target.value
                          const u = Math.round(parseFloat(v) || 0)
                          setLines((prev) => prev.map((l) => l.uid === line.uid
                            ? { ...l, mode: 'unit', unit_price_input: v, total_input: String(u * l.quantity) }
                            : l))
                        }}
                        placeholder="단가" />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <input type="text" style={{ width: 100, padding: '5px 7px', border: `1px solid ${line.mode === 'total' ? '#6366f1' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                        value={line.mode === 'total' ? line.total_input : (r.line_total > 0 ? String(r.line_total) : '')}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '')
                          setLines((prev) => prev.map((l) => l.uid === line.uid
                            ? { ...l, mode: 'total', total_input: v, unit_price_input: '' }
                            : l))
                        }}
                        placeholder="총액" />
                      {line.mode === 'total' && <div style={{ fontSize: 9, color: '#059669', textAlign: 'right', marginTop: 1 }}>총액기준</div>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                      {r.line_total.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}
                        style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 합계 */}
      {lines.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#f9fafb', borderRadius: 8, marginBottom: 16 }}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>견적 합계</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatKRW(totals.total)}</span>
        </div>
      )}

      {/* 메모 */}
      <div style={{ marginBottom: 16 }}>
        <label style={s.label}>메모</label>
        <input style={s.input} placeholder="전달사항 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => router.back()}
          style={{ padding: '11px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer' }}>
          취소
        </button>
        <button onClick={handleSubmit} disabled={submitting || !selectedCustomer || !lines.length}
          style={{ padding: '11px 24px', background: submitting || !lines.length ? '#e5e7eb' : '#111827', color: submitting || !lines.length ? '#9ca3af' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          {submitting ? '저장 중...' : `견적 저장 (${formatKRW(totals.total)})`}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap:    { maxWidth: 960, margin: '0 auto', padding: '28px 24px' },
  titleBar:{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' },
  title:   { fontSize: 18, fontWeight: 600 },
  badge:   { background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20 },
  err:     { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  topRow:  { display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' },
  label:   { display: 'block', fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:   { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' },
  dd:      { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 280, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 },
  ddItem:  { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f9fafb' },
}
