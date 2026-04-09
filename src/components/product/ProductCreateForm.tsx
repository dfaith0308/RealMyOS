'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProduct } from '@/actions/product'
import { addCategory } from '@/actions/category'
import { calcMarginRate, formatKRW } from '@/lib/calc'
import SearchableSelectWithAdd from '@/components/common/SearchableSelectWithAdd'
import type { Category } from '@/actions/category'
import type { SelectOption } from '@/components/common/SearchableSelectWithAdd'

interface Supplier { id: string; name: string }

interface Props {
  categories: Category[]
  suppliers: Supplier[]
}

// ── 마진 계산 공통 함수 ────────────────────────────────────────

function calcMargin(price: string, cost: number): { rate: number | null; warn: boolean } | null {
  const p = Number(price)
  if (!p || p <= 0 || cost <= 0) return null
  const rate = calcMarginRate(p, cost)
  return { rate, warn: false }  // warn은 minMarginRate 알 때 적용
}

function MarginTag({ price, cost, minMarginRate }: { price: string; cost: number; minMarginRate: string }) {
  const p = Number(price)
  if (!p || !isFinite(p) || p <= 0) return null
  if (!cost || !isFinite(cost) || cost <= 0) return null
  const rate = calcMarginRate(p, cost)
  if (!isFinite(rate) || isNaN(rate)) return null
  const min = Number(minMarginRate) || 0
  const isWarn = min > 0 && rate < min
  return (
    <span style={{
      fontSize: 11, fontWeight: 500,
      color: isWarn ? '#B91C1C' : rate < 10 ? '#B45309' : '#15803D',
    }}>
      마진 {rate.toFixed(1)}%{isWarn ? ' ⚠️' : ''}
    </span>
  )
}

export default function ProductCreateForm({ categories: initCats, suppliers }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<SelectOption[]>(initCats)
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [name, setName] = useState('')
  const [taxType, setTaxType] = useState<'taxable' | 'exempt'>('taxable')
  const [barcode, setBarcode] = useState('')
  const [minMargin, setMinMargin] = useState('')

  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [siksikiPrice, setSiksikiPrice] = useState('')
  const [subscriptionPrice, setSubscriptionPrice] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkMinQty, setBulkMinQty] = useState('')
  const [bulkQtyMsg, setBulkQtyMsg] = useState('')

  const [marginMode, setMarginMode] = useState<'price' | 'margin'>('price')
  const [marginInput, setMarginInput] = useState('')

  const cost = Number(costPrice) || 0

  function handleMarginInput(v: string) {
    setMarginInput(v)
    const m = Number(v) / 100
    if (cost > 0 && m > 0 && m < 1) {
      setSellingPrice(String(Math.round(cost / (1 - m))))
    }
  }

  async function handleAddCategory(name: string): Promise<SelectOption | null> {
    const r = await addCategory(name)
    if (r.success && r.data) {
      setCategories((p) => [...p, r.data!])
      return r.data
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('상품명을 입력해주세요.'); return }
    if (!costPrice || cost <= 0) { setError('매입가를 입력해주세요.'); return }

    startTransition(async () => {
      const result = await createProduct({
        name,
        tax_type: taxType,
        category_id: categoryId || undefined,
        supplier_id: supplierId || undefined,
        barcode: barcode || undefined,
        min_margin_rate: minMargin ? Number(minMargin) : undefined,
        cost_price: cost,
        selling_price:      sellingPrice      ? Number(sellingPrice)      : undefined,
        siksiki_price:      siksikiPrice      ? Number(siksikiPrice)      : undefined,
        subscription_price: subscriptionPrice ? Number(subscriptionPrice) : undefined,
        bulk_price:         bulkPrice         ? Number(bulkPrice)         : undefined,
        bulk_min_quantity:  bulkMinQty ? Math.max(1, Math.floor(Number(bulkMinQty))) : undefined,
      })
      if (result.success) router.push('/products')
      else setError(result.error ?? '저장 실패')
    })
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>상품 등록</h1>
      {error && <div style={s.err}>{error}</div>}

      <form onSubmit={handleSubmit} style={s.form}>

        <SearchableSelectWithAdd
          label="카테고리"
          options={categories} value={categoryId}
          onChange={(id) => setCategoryId(id)}
          onAdd={handleAddCategory}
          placeholder="카테고리 검색 또는 추가" />

        <F label="상품명 *">
          <input style={s.input} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="예: 국내산 고추가루 1kg" required />
        </F>

        <F label="과세 구분">
          <Seg options={[{ value: 'taxable', label: '과세' }, { value: 'exempt', label: '면세' }]}
            value={taxType} onChange={(v) => setTaxType(v as 'taxable' | 'exempt')} />
        </F>

        <F label="매입처">
          <SearchableSelectWithAdd
            options={suppliers} value={supplierId}
            onChange={(id) => setSupplierId(id)}
            placeholder="매입처 검색" />
        </F>

        <F label="바코드">
          <input style={s.input} value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
            placeholder="숫자만 입력" />
        </F>

        <div style={s.divider} />

        <F label="매입가 *">
          <input style={s.input} type="number" value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)} placeholder="0" min={0} />
        </F>

        {/* 판매가 */}
        <F label={<>판매가 <MarginTag price={sellingPrice} cost={cost} minMarginRate={minMargin} /></>}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button type="button"
              style={{ ...s.modeBtn, background: marginMode === 'price' ? '#111827' : '#fff', color: marginMode === 'price' ? '#fff' : '#374151' }}
              onClick={() => setMarginMode('price')}>판매가 입력</button>
            <button type="button"
              style={{ ...s.modeBtn, background: marginMode === 'margin' ? '#111827' : '#fff', color: marginMode === 'margin' ? '#fff' : '#374151' }}
              onClick={() => setMarginMode('margin')}>마진율 입력</button>
          </div>
          {marginMode === 'price' ? (
            <input style={s.input} type="number" value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" min={0} />
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...s.input, flex: 1 }} type="number" value={marginInput}
                onChange={(e) => handleMarginInput(e.target.value)}
                placeholder="마진율 %" min={0} max={99} />
              {sellingPrice && <span style={{ fontSize: 13, color: '#6b7280' }}>→ {formatKRW(Number(sellingPrice))}</span>}
            </div>
          )}
        </F>

        {/* 식식이가 */}
        <F label={<>식식이가 <MarginTag price={siksikiPrice} cost={cost} minMarginRate={minMargin} /></>}>
          <input style={s.input} type="number" value={siksikiPrice}
            onChange={(e) => setSiksikiPrice(e.target.value)} placeholder="0" min={0} />
        </F>

        {/* 구독회원가 */}
        <F label={<>구독회원가 <MarginTag price={subscriptionPrice} cost={cost} minMarginRate={minMargin} /></>}>
          <input style={s.input} type="number" value={subscriptionPrice}
            onChange={(e) => setSubscriptionPrice(e.target.value)} placeholder="0" min={0} />
        </F>

        {/* 대량구매 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
            대량구매가{' '}
            {bulkPrice && bulkMinQty && cost > 0 && (
              <MarginTag price={bulkPrice} cost={cost} minMarginRate={minMargin} />
            )}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>최소 수량</div>
              <input style={s.input} type="number" value={bulkMinQty}
                onChange={(e) => setBulkMinQty(e.target.value)}
                onBlur={(e) => {
                  const raw = e.target.value
                  if (!raw) return
                  const floored = Math.max(1, Math.floor(Number(raw)))
                  const corrected = String(floored)
                  if (corrected !== raw) {
                    setBulkMinQty(corrected)
                    setBulkQtyMsg('수량은 정수 기준으로 자동 보정되었습니다.')
                    setTimeout(() => setBulkQtyMsg(''), 2000)
                  } else {
                    setBulkMinQty(corrected)
                  }
                }}
                placeholder="예: 10" min={1} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>개당 가격</div>
              <input style={s.input} type="number" value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)} placeholder="0" min={0} />
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>수량은 소수 입력 시 내림 처리됩니다.</span>
          {bulkQtyMsg && (
            <span style={{ fontSize: 11, color: '#B45309' }}>{bulkQtyMsg}</span>
          )}
          {!bulkQtyMsg && bulkPrice && !bulkMinQty && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>최소 수량 입력 시 마진 계산됩니다.</span>
          )}
        </div>

        <div style={s.divider} />

        <F label="최소 마진율 (%) — 미입력 시 전역 기준 적용">
          <input style={s.input} type="number" value={minMargin}
            onChange={(e) => setMinMargin(e.target.value)} placeholder="미입력 시 설정값 사용" min={0} max={100} />
        </F>

        <button type="submit" style={isPending ? s.submitOff : s.submit} disabled={isPending}>
          {isPending ? '저장 중...' : '상품 등록'}
        </button>
      </form>
    </div>
  )
}

function F({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'flex', gap: 6, alignItems: 'center' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Seg({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: '8px', border: 'none',
            borderRight: i < options.length - 1 ? '1px solid #d1d5db' : 'none',
            background: value === o.value ? '#111827' : '#fff',
            color: value === o.value ? '#fff' : '#374151',
            fontSize: 13, cursor: 'pointer', fontWeight: value === o.value ? 500 : 400,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:      { maxWidth: 560, margin: '0 auto', padding: '32px 24px 60px' },
  title:     { fontSize: 18, fontWeight: 600, marginBottom: 24 },
  err:       { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  input:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  modeBtn:   { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  divider:   { height: 1, background: '#f3f4f6', margin: '4px 0' },
  submit:    { padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff: { padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
}