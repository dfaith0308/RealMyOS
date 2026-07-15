'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPayment, getCustomerBalance } from '@/actions/payment'
import { useDeposit } from '@/actions/customer-deposits'
import { getCustomersForOrder } from '@/actions/order'
import { formatKRW, todayStr } from '@/lib/calc'
import type { CustomerForOrder } from '@/types/order'
import type { PaymentMethod } from '@/actions/payment'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'transfer',  label: '무통장' },
  { value: 'cash',      label: '현금' },
  { value: 'card',      label: '카드' },
  { value: 'platform',  label: '플랫폼' },
]

interface Props {
  initialCustomerId?: string
  collectionScheduleId?: string
  onSuccess?: () => void
  embedded?: boolean
}

export default function PaymentCreateForm({
  initialCustomerId = '',
  collectionScheduleId = '',
  onSuccess,
  embedded = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [customers, setCustomers] = useState<CustomerForOrder[]>([])
  const [customerQuery, setCustomerQuery] = useState('')
  const [showDd, setShowDd] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerForOrder | null>(null)

  const [balance, setBalance]   = useState<number | null>(null)
  const [deposit, setDeposit]   = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  const [amount, setAmount]           = useState('')
  const [paymentDate, setPaymentDate] = useState(todayStr())
  const [method, setMethod]           = useState<PaymentMethod>('transfer')
  const [memo, setMemo]               = useState('')
  const [error, setError]             = useState<string | null>(null)

  const [useDepositEnabled, setUseDepositEnabled] = useState(false)
  const [useDepositAmount, setUseDepositAmount] = useState('')

  // 수금 완료 후 결과 표시
  const [resultDeposit, setResultDeposit] = useState<number | null>(null)

  useEffect(() => {
    getCustomersForOrder().then((r) => {
      if (!r.success) return
      const list = r.data ?? []
      setCustomers(list)
      // URL query로 거래처 자동 선택
      if (initialCustomerId) {
        const found = list.find((c) => c.id === initialCustomerId)
        if (found) setSelectedCustomer(found)
      }
    })
  }, [initialCustomerId])

  useEffect(() => {
    if (!selectedCustomer) { setBalance(null); setDeposit(null); return }
    setLoadingBalance(true)
    getCustomerBalance(selectedCustomer.id).then((r) => {
      if (r.success && r.data) {
        setBalance(r.data.balance)
        setDeposit(r.data.deposit)
      }
      setLoadingBalance(false)
    })
  }, [selectedCustomer])

  const amountNum      = Number(amount) || 0
  const useDepNum      = Number(useDepositAmount) || 0
  const currentBalance = balance ?? 0
  const overAmount     = amountNum > currentBalance && currentBalance >= 0
    ? amountNum - currentBalance : 0

  const filteredCustomers = customers.filter((c) => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').replace(/-/g, '').includes(q.replace(/-/g, '')) ||
      (c.representative_name ?? '').toLowerCase().includes(q)
    )
  })

  const visibleCustomers = filteredCustomers.slice(0, 8)

  function pickCustomer(c: CustomerForOrder) {
    setSelectedCustomer(c)
    setCustomerQuery('')
    setShowDd(false)
    setActiveIndex(-1)
  }

  function handleCustomerKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDd || visibleCustomers.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, visibleCustomers.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && visibleCustomers[activeIndex]) {
        pickCustomer(visibleCustomers[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setShowDd(false)
      setActiveIndex(-1)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResultDeposit(null)
    if (!selectedCustomer) { setError('거래처를 선택해주세요.'); return }
    if (!amount || amountNum <= 0) { setError('금액을 입력해주세요.'); return }
    if (useDepositEnabled) {
      if (!useDepositAmount || useDepNum <= 0) { setError('예치금 사용 금액을 입력해주세요.'); return }
      if (!Number.isInteger(useDepNum)) { setError('예치금 사용 금액은 정수여야 합니다.'); return }
      if (useDepNum > (deposit ?? 0)) { setError('예치금 잔액을 초과할 수 없습니다.'); return }
    }

    startTransition(async () => {
      const totalSettlement = amountNum + (useDepositEnabled ? useDepNum : 0)
      const memoMerged = useDepositEnabled
        ? [memo?.trim(), `예치금 사용: ${formatKRW(useDepNum)}`].filter(Boolean).join(' / ')
        : memo

      // 예치금 사용(내부 차감) → 수금 등록(미수 상계)
      if (useDepositEnabled && useDepNum > 0) {
        const d = await useDeposit(selectedCustomer.id, useDepNum, null)
        if (!d.success) {
          setError(d.error ?? '예치금 사용 실패')
          return
        }
        setDeposit((v) => Math.max(0, (v ?? 0) - useDepNum))
      }

      const r = await createPayment({
        customer_id:          selectedCustomer.id,
        amount:               totalSettlement,
        payment_date:         paymentDate,
        payment_method:       method,
        memo:                 memoMerged || undefined,
        collection_schedule_id: collectionScheduleId || undefined,
      })
      if (r.success && r.data) {
        if (r.data.deposit_amount > 0) {
          setResultDeposit(r.data.deposit_amount)
          setBalance(0)
          setDeposit((d) => (d ?? 0) + r.data!.deposit_amount)
        } else {
          setBalance((b) => Math.max(0, (b ?? 0) - totalSettlement))
        }
        setAmount('')
        setMemo('')
        setUseDepositEnabled(false)
        setUseDepositAmount('')
        setTimeout(() => {
          router.refresh()
          setResultDeposit(null)
          onSuccess?.()
        }, 800)
      } else {
        setError(r.error ?? '저장 실패')
      }
    })
  }

  return (
    <div style={s.wrap}>
      {!embedded ? <h1 style={s.title}>수금 등록</h1> : null}
      {error && <div style={s.err}>{error}</div>}

      {resultDeposit !== null && resultDeposit > 0 && (
        <div style={s.depositBanner}>
          ✅ 수금 완료 · 예치금 발생 +{formatKRW(resultDeposit)}
        </div>
      )}
      {resultDeposit === 0 && (
        <div style={s.okBanner}>✅ 수금 완료</div>
      )}

      <form onSubmit={handleSubmit} style={s.form}>

        {/* 거래처 */}
        <div style={{ position: 'relative' }}>
          <label style={s.label}>거래처 *</label>
          <input style={s.input}
            value={selectedCustomer ? selectedCustomer.name : customerQuery}
            placeholder="거래처명 · 대표자명 · 연락처 검색"
            onFocus={() => { setShowDd(true); if (selectedCustomer) setCustomerQuery('') }}
            onChange={(e) => {
              setCustomerQuery(e.target.value)
              setSelectedCustomer(null)
              setShowDd(true)
              setActiveIndex(-1)
            }}
            onKeyDown={handleCustomerKeyDown}
            autoComplete="off" />
          {showDd && visibleCustomers.length > 0 && (
            <div style={s.dd}>
              {visibleCustomers.map((c, idx) => (
                <button key={c.id} type="button"
                  style={{ ...s.ddItem, ...(activeIndex === idx ? s.ddItemActive : null) }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pickCustomer(c)}>
                  <div style={s.customerName}>{c.name}</div>
                  {c.representative_name && (
                    <div style={s.customerSub}>{c.representative_name}</div>
                  )}
                  {c.phone && (
                    <div style={s.customerSub}>{c.phone}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 잔액/예치금 표시 */}
        {selectedCustomer && (
          <div style={s.balanceBox}>
            {loadingBalance ? (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>잔액 조회 중...</span>
            ) : (
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={s.balLabel}>미수금</div>
                  <div style={{ ...s.balVal, color: (balance ?? 0) > 0 ? '#B91C1C' : '#15803D' }}>
                    {formatKRW(balance ?? 0)}
                  </div>
                </div>
                {(deposit ?? 0) > 0 && (
                  <div>
                    <div style={s.balLabel}>예치금</div>
                    <div style={{ ...s.balVal, color: '#1D4ED8' }}>
                      +{formatKRW(deposit ?? 0)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 금액 */}
        <div>
          <label style={s.label}>수금액 *</label>
          <input style={s.input} type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0" min={1} />
          {overAmount > 0 && (
            <div style={s.overWarn}>
              ⚠️ 잔액 초과 — {formatKRW(overAmount)} 예치금으로 처리됩니다
            </div>
          )}
        </div>

        {/* 예치금 사용 */}
        {selectedCustomer && (deposit ?? 0) > 0 && (
          <div style={s.depositUseBox}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useDepositEnabled}
                onChange={(e) => { setUseDepositEnabled(e.target.checked); if (!e.target.checked) setUseDepositAmount('') }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>
                예치금 사용
              </span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                (잔액 +{formatKRW(deposit ?? 0)})
              </span>
            </label>
            {useDepositEnabled && (
              <div style={{ marginTop: 8 }}>
                <input
                  style={s.input}
                  type="number"
                  value={useDepositAmount}
                  onChange={(e) => setUseDepositAmount(e.target.value)}
                  placeholder="사용 금액"
                  min={1}
                />
                <div style={s.depositHint}>
                  예치금 사용분은 내부 차감 후, 수금액과 합산되어 미수에 반영됩니다.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 날짜 */}
        <div>
          <label style={s.label}>수금일자 *</label>
          <input style={s.input} type="date" value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)} />
        </div>

        {/* 방법 */}
        <div>
          <label style={s.label}>수금 방법</label>
          <div style={s.seg}>
            {METHOD_OPTIONS.map((m, i) => (
              <button key={m.value} type="button"
                style={{
                  flex: 1, padding: '8px 4px', border: 'none',
                  borderRight: i < METHOD_OPTIONS.length - 1 ? '1px solid #d1d5db' : 'none',
                  background: method === m.value ? '#111827' : '#fff',
                  color: method === m.value ? '#fff' : '#374151',
                  fontSize: 13, cursor: 'pointer',
                  fontWeight: method === m.value ? 500 : 400,
                }}
                onClick={() => setMethod(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 메모 */}
        <div>
          <label style={s.label}>메모</label>
          <input style={s.input} value={memo}
            onChange={(e) => setMemo(e.target.value)} placeholder="선택 입력" />
        </div>

        <button type="submit"
          style={isPending ? s.submitOff : s.submit}
          disabled={isPending}>
          {isPending ? '저장 중...' : '수금 등록'}
        </button>
      </form>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap:          { maxWidth: 480, margin: '0 auto', padding: '32px 24px 60px' },
  title:         { fontSize: 18, fontWeight: 600, marginBottom: 24 },
  err:           { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  depositBanner: { background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 16 },
  okBanner:      { background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 },
  form:          { display: 'flex', flexDirection: 'column', gap: 16 },
  label:         { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 },
  input:         { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  dd:            { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 4 },
  ddItem:        { display: 'block', width: '100%', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f3f4f6', background: '#fff', fontSize: 14, textAlign: 'left', cursor: 'pointer' },
  ddItemActive:  { background: 'var(--ds-neutral-100)' },
  customerName:  { fontSize: 14, fontWeight: 600, color: '#111827' },
  customerSub:   { fontSize: 11.5, color: '#9ca3af', marginTop: 2 },
  balanceBox:    { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' },
  balLabel:      { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  balVal:        { fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  overWarn:      { marginTop: 6, padding: '7px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 6, fontSize: 12, color: '#C2410C', fontWeight: 500 },
  depositUseBox: { background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '12px 16px' },
  depositHint:   { marginTop: 6, fontSize: 12, color: '#6b7280', lineHeight: 1.5 },
  seg:           { display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' },
  submit:        { padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  submitOff:     { padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'not-allowed' },
}