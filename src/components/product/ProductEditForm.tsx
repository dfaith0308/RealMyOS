'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateProduct, updateCostPrice } from '@/actions/product'
import { addCategory } from '@/actions/category'
import { calcMarginRate, formatKRW } from '@/lib/calc'
import SearchableSelectWithAdd from '@/components/common/SearchableSelectWithAdd'
import type { Category } from '@/actions/category'
import type { SelectOption } from '@/components/common/SearchableSelectWithAdd'

interface ProductData {
  id: string
  product_code: string
  name: string
  tax_type: 'taxable' | 'exempt'
  category_id: string | null
  supplier_id: string | null
  barcode: string | null
  min_margin_rate: number | null
  product_costs: Array<{ cost_price: number; end_date: string | null }>
  product_prices: Array<{ price_type: string; price: number }>
  product_logs: Array<{ action: string; before_data: any; after_data: any; created_at: string }>
}

interface Props {
  product: ProductData
  categories: Category[]
  suppliers: Array<{ id: string; name: string }>
  marginThreshold: number
}

export default function ProductEditForm({ product, categories: initCats, suppliers, marginThreshold }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const currentCost = product.product_costs.find((c) => c.end_date === null)?.cost_price ?? 0
  const priceMap = Object.fromEntries(product.product_prices.map((p) => [p.price_type, p.price]))

  const [categories, setCategories] = useState<SelectOption[]>(initCats)
  const [categoryId, setCategoryId] = useState(product.category_id ?? '')
  const [supplierId, setSupplierId] = useState(product.supplier_id ?? '')
  const [name, setName] = useState(product.name)
  const [taxType, setTaxType] = useState<'taxable' | 'exempt'>(product.tax_type)
  const [barcode, setBarcode] = useState(product.barcode ?? '')
  const [minMargin, setMinMargin] = useState(String(product.min_margin_rate ?? ''))
  const [sellingPrice, setSellingPrice] = useState(String(priceMap.normal ?? ''))
  const [siksikiPrice, setSiksikiPrice] = useState(String(priceMap.siksiki ?? ''))
  const [subscriptionPrice, setSubscriptionPrice] = useState(String(priceMap.subscription ?? ''))
  const [bulkPrice, setBulkPrice] = useState(String(priceMap.bulk ?? ''))

  // 매입가 변경
  const [showCostEdit, setShowCostEdit] = useState(false)
  const [newCost, setNewCost] = useState('')
  const [costStartDate, setCostStartDate] = useState(new Date().toISOString().slice(0, 10))

  const selling = Number(sellingPrice) || 0
  const marginRate = selling > 0 && currentCost > 0 ? calcMarginRate(selling, currentCost) : null
  const threshold = product.min_margin_rate ?? marginThreshold
  const isWarning = marginRate !== null && marginRate < threshold

  async function handleAddCategory(name: string): Promise<SelectOption | null> {
    const r = await addCategory(name)
    if (r.success && r.data) { setCategories((p) => [...p, r.data!]); return r.data }
    return null
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const r = await updateProduct({
        id: product.id,
        name: name.trim(),
        tax_type: taxType,
        category_id: categoryId || null,
        supplier_id: supplierId || null,
        barcode: barcode || undefined,
        min_margin_rate: minMargin ? Number(minMargin) : null,
        selling_price: sellingPrice ? Number(sellingPrice) : undefined,
        siksiki_price: siksikiPrice ? Number(siksikiPrice) : undefined,
        subscription_price: subscriptionPrice ? Number(subscriptionPrice) : undefined,
        bulk_price: bulkPrice ? Number(bulkPrice) : undefined,
      })
      if (r.success) { setSuccess(true); setTimeout(() => router.push('/products'), 800) }
      else setError(r.error ?? '저장 실패')
    })
  }

  function handleCostSave() {
    if (!newCost || Number(newCost) <= 0) { setError('새 매입가를 입력해주세요.'); return }
    startTransition(async () => {
      const r = await updateCostPrice({
        product_id: product.id,
        new_cost_price: Number(newCost),
        start_date: costStartDate,
      })
      if (r.success) { setShowCostEdit(false); setNewCost(''); setSuccess(true) }
      else setError(r.error ?? '저장 실패')
    })
  }

  return (
    <div style={s.wrap}>
      <h1 style={s.title}>상품 수정</h1>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 20 }}>
        제품코드: <strong>{product.product_code}</strong> (수정 불가)
      </p>

      {error && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>저장됐습니다.</div>}
      {isWarning && (
        <div style={s.warn}>
          ⚠️ 마진 경고 — 현재 마진 {marginRate?.toFixed(1)}%가 기준 {threshold}%보다 낮습니다.
        </div>
      )}

      <div style={s.form}>
        <SearchableSelectWithAdd label="카테고리"
          options={categories} value={categoryId}
          onChange={(id) => setCategoryId(id)} onAdd={handleAddCategory} />

        <F label="상품명 *">
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} />
        </F>

        <F label="과세 구분">
          <Seg options={[{ value: 'taxable', label: '과세' }, { value: 'exempt', label: '면세' }]}
            value={taxType} onChange={(v) => setTaxType(v as any)} />
        </F>

        <F label="매입처">
          <SearchableSelectWithAdd options={suppliers} value={supplierId}
            onChange={(id) => setSupplierId(id)} placeholder="매입처 검색" />
        </F>

        <F label="바코드">
          <input style={s.input} value={barcode}
            onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} />
        </F>

        <div style={s.divider} />

        {/* 매입가 (이력 유지) */}
        <F label="현재 매입가">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{formatKRW(currentCost)}</span>
            <button type="button" style={s.smallBtn}
              onClick={() => setShowCostEdit((v) => !v)}>
              {showCostEdit ? '취소' : '변경'}
            </button>
          </div>
          {showCostEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>※ 기존 매입가 이력이 보존됩니다</p>
              <input style={s.input} type="number" value={newCost}
                onChange={(e) => setNewCost(e.target.value)} placeholder="새 매입가" />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#374151' }}>적용 시작일</label>
                <input style={s.input} type="date" value={costStartDate}
                  onChange={(e) => setCostStartDate(e.target.value)} />
              </div>
              <button type="button" style={s.saveBtn} onClick={handleCostSave} disabled={isPending}>
                매입가 변경 저장
              </button>
            </div>
          )}
        </F>

        <F label={`판매가 ${marginRate !== null ? `— 마진 ${marginRate.toFixed(1)}%` : ''}`}>
          <input style={{ ...s.input, borderColor: isWarning ? '#FCA5A5' : '#d1d5db' }}
            type="number" value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)} />
        </F>

        <F label="식식이가">
          <input style={s.input} type="number" value={siksikiPrice}
            onChange={(e) => setSiksikiPrice(e.target.value)} />
        </F>
        <F label="구독회원가">
          <input style={s.input} type="number" value={subscriptionPrice}
            onChange={(e) => setSubscriptionPrice(e.target.value)} />
        </F>
        <F label="대량구매가">
          <input style={s.input} type="number" value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)} />
        </F>

        <div style={s.divider} />

        <F label="최소 마진율 (%)">
          <input style={s.input} type="number" value={minMargin}
            onChange={(e) => setMinMargin(e.target.value)} placeholder={`전역 기준 ${marginThreshold}%`} />
        </F>

        {/* 수정 이력 최근 5건 */}
        {product.product_logs.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
              최근 수정 이력
            </p>
            {product.product_logs.slice(0, 5).map((log, i) => (
              <div key={i} style={{ fontSize: 11, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                {new Date(log.created_at).toLocaleDateString('ko-KR')} — {log.action}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={s.cancelBtn}
            onClick={() => router.push('/products')}>취소</button>
          <button type="button" style={isPending ? s.submitOff : s.submit}
            onClick={handleSave} disabled={isPending}>
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
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
function Seg({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          style={{ flex: 1, padding: '8px', border: 'none', borderRight: i < options.length - 1 ? '1px solid #d1d5db' : 'none', background: value === o.value ? '#111827' : '#fff', color: value === o.value ? '#fff' : '#374151', fontSize: 13, cursor: 'pointer' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:      { maxWidth: 560, margin: '0 auto', padding: '32px 24px 60px' },
  title:     { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  err:       { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  ok:        { background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  warn:      { background: '#FFF1F2', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  input:     { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  divider:   { height: 1, background: '#f3f4f6', margin: '4px 0' },
  smallBtn:  { padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  saveBtn:   { padding: '10px', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  cancelBtn: { flex: 1, padding: '12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  submit:    { flex: 2, padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff: { flex: 2, padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
}
