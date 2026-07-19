'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayment, type PaymentDetail, type PaymentMethod } from '@/actions/payment'
import { formatKRW } from '@/lib/calc'
import { Surface } from '@/components/ui/Surface'

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'transfer', label: '무통장' },
  { value: 'cash',     label: '현금' },
  { value: 'card',     label: '카드' },
  { value: 'platform', label: '플랫폼' },
]

export default function PaymentEditForm({
  payment,
  allocatedSum = 0,
}: {
  payment: PaymentDetail
  allocatedSum?: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const amountLocked = (payment.deposit_amount ?? 0) > 0
  const canEdit = payment.status === 'confirmed'

  const [amount, setAmount] = useState(String(payment.amount))
  const [paymentDate, setPaymentDate] = useState(payment.payment_date)
  const [method, setMethod] = useState<PaymentMethod>(
    (METHOD_OPTIONS.some((m) => m.value === payment.payment_method)
      ? payment.payment_method
      : 'transfer') as PaymentMethod,
  )
  const [memo, setMemo] = useState(payment.memo ?? '')
  const [editReason, setEditReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  if (!canEdit) return null

  const amountNum = Number(amount) || 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)

    if (!editReason.trim()) {
      setError('수정 사유를 입력해주세요.')
      return
    }
    if (!paymentDate) {
      setError('수금일자를 입력해주세요.')
      return
    }
    if (!amount || amountNum <= 0 || !Number.isInteger(amountNum)) {
      setError('유효한 금액을 입력해주세요. (양의 정수)')
      return
    }
    if (!amountLocked && amountNum < allocatedSum) {
      setError(`금액은 배분 합계(${formatKRW(allocatedSum)}) 이상이어야 합니다.`)
      return
    }

    startTransition(async () => {
      const r = await updatePayment({
        payment_id: payment.id,
        payment_date: paymentDate,
        amount: amountLocked ? payment.amount : amountNum,
        payment_method: method,
        memo: memo.trim() || null,
        edit_reason: editReason.trim(),
      })
      if (!r.success) {
        setError(r.error ?? '수정 실패')
        return
      }
      setOk('수정되었습니다.')
      setEditReason('')
      router.refresh()
    })
  }

  return (
    <Surface variant="panel" density="comfortable">
      <div style={s.header}>
        <div style={s.title}>수금 정보 수정</div>
        <button type="button" style={s.toggle} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '펼치기'}
        </button>
      </div>

      {!open ? (
        <div style={s.hint}>날짜·금액·방식·메모를 수정하려면 펼치세요. 주문 배분은 아래 배분 영역에서 합니다.</div>
      ) : (
        <form onSubmit={handleSubmit} style={s.form}>
          {error ? <div style={s.err}>{error}</div> : null}
          {ok ? (
            <>
              <div style={s.ok}>{ok}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => router.back()}
                  style={{ padding: '8px 16px', background: '#f7f6f2', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ← 이전 페이지
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/payments')}
                  style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  수금 목록
                </button>
              </div>
            </>
          ) : null}

          <div>
            <label style={s.label}>수금일자 *</label>
            <input
              style={s.input}
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <label style={s.label}>수금액 *</label>
            <input
              style={{ ...s.input, ...(amountLocked ? s.inputDisabled : {}) }}
              type="number"
              value={amount}
              min={1}
              disabled={amountLocked}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountLocked ? (
              <div style={s.warn}>
                예치금이 포함된 수금은 금액을 변경할 수 없습니다. 필요 시 취소 후 재등록하세요.
              </div>
            ) : allocatedSum > 0 ? (
              <div style={s.sub}>배분 합계 {formatKRW(allocatedSum)} 이상이어야 합니다.</div>
            ) : null}
          </div>

          <div>
            <label style={s.label}>수금 방법</label>
            <div style={s.seg}>
              {METHOD_OPTIONS.map((m, i) => (
                <button
                  key={m.value}
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    border: 'none',
                    borderRight: i < METHOD_OPTIONS.length - 1 ? '1px solid #d1d5db' : 'none',
                    background: method === m.value ? '#111827' : '#fff',
                    color: method === m.value ? '#fff' : '#374151',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: method === m.value ? 500 : 400,
                  }}
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={s.label}>메모</label>
            <textarea
              style={{ ...s.input, minHeight: 72, resize: 'vertical' as const }}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선택 입력"
            />
          </div>

          <div>
            <label style={s.label}>수정 사유 *</label>
            <input
              style={s.input}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="예: 입금일 오기재 수정"
              required
            />
            <div style={s.sub}>저장 시 메모에 `[수정 날짜] 사유`가 추가되고, 감사 로그에도 남습니다.</div>
          </div>

          <button type="submit" style={isPending ? s.submitOff : s.submit} disabled={isPending}>
            {isPending ? '저장 중...' : '수정 저장'}
          </button>
        </form>
      )}
    </Surface>
  )
}

const s: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  title: { fontSize: 14, fontWeight: 900, color: 'var(--ds-text-primary)' },
  toggle: {
    border: '1px solid var(--ds-border-default)',
    background: 'var(--ds-surface-panel)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    color: 'var(--ds-text-primary)',
  },
  hint: { fontSize: 12, fontWeight: 700, color: 'var(--ds-text-muted)', lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 },
  input: {
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff',
  },
  inputDisabled: { background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' },
  sub: { marginTop: 6, fontSize: 12, color: '#6b7280', lineHeight: 1.45 },
  warn: {
    marginTop: 6,
    padding: '7px 12px',
    background: '#FFF7ED',
    border: '1px solid #FED7AA',
    borderRadius: 6,
    fontSize: 12,
    color: '#C2410C',
    fontWeight: 500,
    lineHeight: 1.45,
  },
  seg: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' },
  err: {
    background: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FECACA',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
  },
  ok: {
    background: '#F0FDF4',
    color: '#15803D',
    border: '1px solid #86EFAC',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
  },
  submit: {
    padding: '12px',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitOff: {
    padding: '12px',
    background: '#9ca3af',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    cursor: 'not-allowed',
  },
}
