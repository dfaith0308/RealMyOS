'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPayment, getCustomerBalance } from '@/actions/payment'
import { getCustomersForOrder } from '@/actions/order'
import { formatKRW, todayStr } from '@/lib/calc'
import type { CustomerForOrder } from '@/types/order'
import type { PaymentMethod } from '@/actions/payment'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'transfer', label: '무통장' },
  { value: 'cash',     label: '현금' },
  { value: 'card',     label: '카드' },
]

export default function PaymentCreateForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [customers, setCustomers] = useState<CustomerForOrder[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [showDd, setShowDd] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayStr())
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 거래처 목록 로드
  useEffect(() => {
    getCustomersForOrder().then((r) => {
      if (r.success) setCustomers(r.data ?? [])
    })
  }, [])

  // 거래처 선택 시 잔액 조회
  useEffect(() => {
    if (!selectedCustomer) { setBalance(null); return }
    setLoadingBalance(true)
    getCustomerBalance(selectedCustomer.id).then((r) => {
      if (r.success && r.data) setBalance(r.data.balance)
      setLoadingBalance(false)
    })
  }, [selectedCustomer])

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerQuery.toLowerCase()),
  )

  function selectCustomer(c: CustomerForOrder) {
    setSelectedCustomer(c)
    setCustomerQuery(c.name)
    setShowDd(false)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) { setError('거래처를 선택해주세요.'); return }
    const amt = parseNum(amount)
    if (amt <= 0) { setError('금액을 입력해주세요.'); return }

    // 잔액 초과 경고 (차단은 안 함 - 예치금 처리 방침)
    if (balance !== null && amt > balance) {
      const over = formatKRW(amt - balance)
      const confirmed = window.confirm(
        `현재 잔액(${formatKRW(balance)})보다 ${over} 초과됩니다.\n계속 저장하시겠습니까?`,
      )
      if (!confirmed) return
    }

    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const result = await createPayment({
        customer_id: selectedCustomer.id,
        amount: amt,
        payment_date: paymentDate,
        payment_method: method,
        memo: memo || undefined,
      })

      if (result.success) {
        setSuccess(
          `수금 완료: ${selectedCustomer.name} — ${formatKRW(amt)}`,
        )
        setAmount('')
        setMemo('')
        // 잔액 재조회
        setLoadingBalance(true)
        getCustomerBalance(selectedCustomer.id).then((r) => {
          if (r.success && r.data) setBalance(r.data.balance)
          setLoadingBalance(false)
        })
      } else {
        setError(result.error ?? '저장 실패')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      {error && <div style={s.errBox}>{error}</div>}
      {success && <div style={s.okBox}>✓ {success}</div>}

      {/* 거래처 선택 */}
      <div style={s.field}>
        <label style={s.label}>거래처 *</label>
        <div style={s.rel}>
          <input
            style={s.input}
            placeholder="거래처명 검색..."
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value)
              setShowDd(true)
              if (!e.target.value) setSelectedCustomer(null)
            }}
            onFocus={() => setShowDd(true)}
            onBlur={() => setTimeout(() => setShowDd(false), 150)}
            autoComplete="off"
          />
          {showDd && filteredCustomers.length > 0 && (
            <ul style={s.dd}>
              {filteredCustomers.slice(0, 8).map((c) => (
                <li
                  key={c.id}
                  style={s.ddItem}
                  onMouseDown={() => selectCustomer(c)}
                >
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 현재 잔액 표시 */}
        {selectedCustomer && (
          <div style={s.balanceBox}>
            <span style={s.balanceLabel}>현재 미수금</span>
            {loadingBalance ? (
              <span style={s.balanceAmt}>계산 중...</span>
            ) : (
              <span style={balance && balance > 0 ? s.balanceAmtRed : s.balanceAmt}>
                {balance !== null ? formatKRW(balance) : '-'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 수금일 */}
      <div style={s.field}>
        <label style={s.label}>수금일</label>
        <input
          type="date"
          style={s.input}
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </div>

      {/* 결제수단 */}
      <div style={s.field}>
        <label style={s.label}>결제수단</label>
        <div style={s.segmented}>
          {METHOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              style={method === opt.value ? s.segActive : s.segBtn}
              onClick={() => setMethod(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 금액 */}
      <div style={s.field}>
        <label style={s.label}>금액 *</label>
        <div style={s.rel}>
          <input
            style={{ ...s.input, textAlign: 'right', paddingRight: 36 }}
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(sanitizeNum(e.target.value))}
            placeholder="0"
            required
          />
          <span style={s.suffix}>원</span>
        </div>
      </div>

      {/* 메모 */}
      <div style={s.field}>
        <label style={s.label}>메모</label>
        <input
          style={s.input}
          placeholder="선택"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
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
          {isPending ? '저장 중...' : '수금 등록'}
        </button>
      </div>
    </form>
  )
}

function parseNum(val: string): number {
  return parseInt(val.replace(/,/g, ''), 10) || 0
}

function sanitizeNum(val: string): string {
  const raw = val.replace(/[^0-9]/g, '')
  return raw ? Number(raw).toLocaleString() : ''
}

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
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 500, color: '#374151' },
  rel: { position: 'relative' },
  input: {
    padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 14, outline: 'none',
    background: '#fff', width: '100%', boxSizing: 'border-box',
  },
  dd: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
    zIndex: 50, maxHeight: 240, overflowY: 'auto',
    listStyle: 'none', margin: 0, padding: 0,
  },
  ddItem: {
    padding: '10px 14px', cursor: 'pointer', fontSize: 14,
    borderBottom: '1px solid #f9fafb',
  },
  balanceBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', background: '#f9fafb',
    borderRadius: 8, fontSize: 13,
  },
  balanceLabel: { color: '#6b7280' },
  balanceAmt: { fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' },
  balanceAmtRed: {
    fontWeight: 600, fontVariantNumeric: 'tabular-nums',
    marginLeft: 'auto', color: '#DC2626',
  },
  suffix: {
    position: 'absolute', right: 12, top: '50%',
    transform: 'translateY(-50%)', color: '#9ca3af',
    fontSize: 13, pointerEvents: 'none',
  },
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
