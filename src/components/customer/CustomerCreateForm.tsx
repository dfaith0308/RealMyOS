'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCustomer } from '@/actions/customer'

const PAYMENT_OPTIONS = [
  { value: 0,  label: '즉시결제' },
  { value: 30, label: '30일' },
  { value: 45, label: '45일' },
  { value: 60, label: '60일' },
] as const

export default function CustomerCreateForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentTerms, setPaymentTerms] = useState<0 | 30 | 45 | 60>(0)
  const [openingBalance, setOpeningBalance] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setPhone('')
    setPaymentTerms(0)
    setOpeningBalance('')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('거래처명을 입력해주세요.'); return }
    setError(null)

    startTransition(async () => {
      const result = await createCustomer({
        name,
        phone: phone || undefined,
        payment_terms_days: paymentTerms,
        opening_balance: openingBalance ? parseInt(openingBalance.replace(/,/g, ''), 10) : 0,
        is_buyer: true,
      })

      if (result.success) {
        // 저장 후 목록으로 이동 (목록 미구현 시 초기화)
        router.push('/customers')
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      {error && <div style={s.errBox}>{error}</div>}

      {/* 거래처명 */}
      <div style={s.field}>
        <label style={s.label}>거래처명 *</label>
        <input
          style={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 정무식당"
          autoFocus
          required
        />
      </div>

      {/* 연락처 */}
      <div style={s.field}>
        <label style={s.label}>연락처</label>
        <input
          style={s.input}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
        />
      </div>

      {/* 결제조건 */}
      <div style={s.field}>
        <label style={s.label}>결제조건</label>
        <div style={s.segmented}>
          {PAYMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              style={paymentTerms === opt.value ? s.segActive : s.segBtn}
              onClick={() => setPaymentTerms(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기초미수금 */}
      <div style={s.field}>
        <label style={s.label}>기초미수금</label>
        <div style={s.inputWrap}>
          <input
            style={{ ...s.input, textAlign: 'right', paddingRight: 36 }}
            type="text"
            inputMode="numeric"
            value={openingBalance}
            onChange={(e) => {
              // 숫자만 허용
              const raw = e.target.value.replace(/[^0-9]/g, '')
              setOpeningBalance(raw ? Number(raw).toLocaleString() : '')
            }}
            placeholder="0"
          />
          <span style={s.inputSuffix}>원</span>
        </div>
        <span style={s.hint}>시스템 도입 전 기존 미수금이 있을 경우 입력</span>
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
          style={isPending ? s.submitBtnOff : s.submitBtn}
          disabled={isPending}
        >
          {isPending ? '저장 중...' : '거래처 등록'}
        </button>
      </div>
    </form>
  )
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  errBox: {
    background: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputWrap: {
    position: 'relative',
  },
  inputSuffix: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9ca3af',
    fontSize: 13,
    pointerEvents: 'none',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
  },
  segmented: {
    display: 'flex',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    padding: '9px 0',
    border: 'none',
    borderRight: '1px solid #d1d5db',
    background: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    color: '#374151',
  },
  segActive: {
    flex: 1,
    padding: '9px 0',
    border: 'none',
    borderRight: '1px solid #d1d5db',
    background: '#111827',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  cancelBtn: {
    padding: '10px 20px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    color: '#374151',
  },
  submitBtn: {
    padding: '10px 24px',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitBtnOff: {
    padding: '10px 24px',
    background: '#9ca3af',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'not-allowed',
  },
}
