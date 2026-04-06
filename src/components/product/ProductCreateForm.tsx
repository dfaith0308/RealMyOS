'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProduct } from '@/actions/product'
import { calcMarginRate } from '@/lib/calc'

export default function ProductCreateForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [taxType, setTaxType] = useState<'taxable' | 'exempt'>('taxable')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 마진율 실시간 계산
  const cost = parseNum(costPrice)
  const selling = parseNum(sellingPrice)
  const margin = cost > 0 && selling > 0 ? calcMarginRate(selling, cost) : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('상품명을 입력해주세요.'); return }
    if (cost <= 0) { setError('매입가를 입력해주세요.'); return }
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const result = await createProduct({
        name,
        cost_price: cost,
        selling_price: selling > 0 ? selling : undefined,
        tax_type: taxType,
      })

      if (result.success && result.data) {
        setSuccess(`등록 완료: ${result.data.product_code} — ${name}`)
        // 폼 초기화 (연속 등록 가능)
        setName('')
        setCostPrice('')
        setSellingPrice('')
        setTaxType('taxable')
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      {error && <div style={s.errBox}>{error}</div>}
      {success && (
        <div style={s.okBox}>
          ✓ {success}
          <button
            type="button"
            style={s.goListBtn}
            onClick={() => router.push('/products')}
          >
            목록으로 →
          </button>
        </div>
      )}

      {/* 상품명 */}
      <div style={s.field}>
        <label style={s.label}>상품명 *</label>
        <input
          style={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 국내산 고추가루 1kg"
          autoFocus
          required
        />
      </div>

      {/* 과세 여부 */}
      <div style={s.field}>
        <label style={s.label}>과세 구분</label>
        <div style={s.segmented}>
          <button
            type="button"
            style={taxType === 'taxable' ? s.segActive : s.segBtn}
            onClick={() => setTaxType('taxable')}
          >
            과세
          </button>
          <button
            type="button"
            style={taxType === 'exempt' ? s.segActive : s.segBtn}
            onClick={() => setTaxType('exempt')}
          >
            면세
          </button>
        </div>
      </div>

      {/* 매입가 */}
      <div style={s.field}>
        <label style={s.label}>매입가 *</label>
        <div style={s.inputWrap}>
          <input
            style={{ ...s.input, textAlign: 'right', paddingRight: 36 }}
            type="text"
            inputMode="numeric"
            value={costPrice}
            onChange={(e) => setCostPrice(sanitizeNum(e.target.value))}
            placeholder="0"
            required
          />
          <span style={s.suffix}>원</span>
        </div>
      </div>

      {/* 판매가 */}
      <div style={s.field}>
        <label style={s.label}>
          판매가
          {margin !== null && (
            <span style={margin < 5 ? s.marginBad : s.marginOk}>
              {' '}마진 {margin.toFixed(1)}%
            </span>
          )}
        </label>
        <div style={s.inputWrap}>
          <input
            style={{ ...s.input, textAlign: 'right', paddingRight: 36 }}
            type="text"
            inputMode="numeric"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(sanitizeNum(e.target.value))}
            placeholder="0 (선택)"
          />
          <span style={s.suffix}>원</span>
        </div>
        <span style={s.hint}>입력하지 않으면 주문 시 직접 입력</span>
      </div>

      {/* 버튼 */}
      <div style={s.footer}>
        <button
          type="button"
          style={s.cancelBtn}
          onClick={() => router.back()}
          disabled={isPending}
        >
          취소
        </button>
        <button
          type="submit"
          style={isPending ? s.btnOff : s.btn}
          disabled={isPending}
        >
          {isPending ? '저장 중...' : '상품 등록'}
        </button>
      </div>
    </form>
  )
}

// ── 유틸 ─────────────────────────────────────────────────────

function parseNum(val: string): number {
  return parseInt(val.replace(/,/g, ''), 10) || 0
}

function sanitizeNum(val: string): string {
  const raw = val.replace(/[^0-9]/g, '')
  return raw ? Number(raw).toLocaleString() : ''
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  errBox: {
    background: '#FEF2F2', color: '#DC2626',
    border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', fontSize: 13,
  },
  okBox: {
    background: '#F0FDF4', color: '#15803D',
    border: '1px solid #BBF7D0', borderRadius: 8,
    padding: '10px 14px', fontSize: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  goListBtn: {
    background: 'none', border: 'none',
    color: '#15803D', fontSize: 13,
    cursor: 'pointer', fontWeight: 500,
    textDecoration: 'underline',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 500, color: '#374151' },
  input: {
    padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 14, outline: 'none',
    background: '#fff', width: '100%', boxSizing: 'border-box',
  },
  inputWrap: { position: 'relative' },
  suffix: {
    position: 'absolute', right: 12, top: '50%',
    transform: 'translateY(-50%)', color: '#9ca3af',
    fontSize: 13, pointerEvents: 'none',
  },
  hint: { fontSize: 11, color: '#9ca3af' },
  marginOk: { color: '#16A34A', fontWeight: 400 },
  marginBad: { color: '#DC2626', fontWeight: 500 },
  segmented: {
    display: 'flex', border: '1px solid #d1d5db',
    borderRadius: 8, overflow: 'hidden',
  },
  segBtn: {
    flex: 1, padding: '9px 0', border: 'none',
    borderRight: '1px solid #d1d5db', background: '#fff',
    fontSize: 13, cursor: 'pointer', color: '#374151',
  },
  segActive: {
    flex: 1, padding: '9px 0', border: 'none',
    borderRight: '1px solid #d1d5db', background: '#111827',
    color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 },
  cancelBtn: {
    padding: '10px 20px', background: '#fff',
    border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: 14, cursor: 'pointer', color: '#374151',
  },
  btn: {
    padding: '10px 24px', background: '#111827',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  btnOff: {
    padding: '10px 24px', background: '#9ca3af',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 500, cursor: 'not-allowed',
  },
}
