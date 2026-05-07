'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createDisbursement } from '@/actions/payment'
import type { PaymentMethod } from '@/actions/payment'
import type { PurchaseListItem } from '@/actions/purchase'
import { formatKRW, todayStr } from '@/lib/calc'

interface Props {
  unpaidPurchases: PurchaseListItem[]
}

export default function DisbursementCreateClient({ unpaidPurchases }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [counterparty_name, setCounterpartyName] = useState('')
  const [amount, setAmount] = useState('')
  const [payment_date, setPaymentDate] = useState(todayStr())
  const [due_date, setDueDate] = useState('')
  const [payment_method, setPaymentMethod] = useState<PaymentMethod>('transfer')
  const [memo, setMemo] = useState('')
  const [unlinkedAmount, setUnlinkedAmount] = useState('')

  const [allocByPurchase, setAllocByPurchase] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of unpaidPurchases) m[p.id] = ''
    return m
  })

  const sumAllocated = useMemo(() => {
    let s = 0
    for (const p of unpaidPurchases) {
      const n = Number(allocByPurchase[p.id] || 0)
      if (n > 0) s += Math.floor(n)
    }
    const u = Number(unlinkedAmount || 0)
    if (u > 0) s += Math.floor(u)
    return s
  }, [unpaidPurchases, allocByPurchase, unlinkedAmount])

  function setAlloc(id: string, v: string) {
    setAllocByPurchase((prev) => ({ ...prev, [id]: v }))
  }

  function submit() {
    setError(null)
    const amt = Number(amount)
    if (!counterparty_name.trim()) {
      setError('매입처명을 입력해주세요.')
      return
    }
    if (!amt || amt <= 0 || !Number.isInteger(amt)) {
      setError('지급 금액은 양의 정수여야 합니다.')
      return
    }

    const allocations: { purchase_id: string | null; allocated_amount: number }[] = []
    for (const p of unpaidPurchases) {
      const n = Math.floor(Number(allocByPurchase[p.id] || 0))
      if (n > 0) allocations.push({ purchase_id: p.id, allocated_amount: n })
    }
    const u = Math.floor(Number(unlinkedAmount || 0))
    if (u > 0) allocations.push({ purchase_id: null, allocated_amount: u })

    const sum = allocations.reduce((s, a) => s + a.allocated_amount, 0)
    if (sum > amt) {
      setError(`분배 합계(${formatKRW(sum)})가 지급 금액(${formatKRW(amt)})을 초과합니다.`)
      return
    }

    startTransition(async () => {
      const res = await createDisbursement({
        counterparty_name: counterparty_name.trim(),
        amount:            amt,
        payment_date,
        payment_method,
        due_date:          due_date.trim() ? due_date : null,
        memo:              memo.trim() || null,
        allocations,
      })
      if (!res.success) {
        setError(res.error ?? '저장 실패')
        return
      }
      router.push('/disbursements')
      router.refresh()
    })
  }

  const amtNum = Number(amount || 0)
  const remainder = amtNum > 0 ? amtNum - sumAllocated : 0

  return (
    <div>
      {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <section style={sec}>
        <h2 style={h2}>지급 정보</h2>
        <label style={lb}>매입처(지급 상대) *</label>
        <input style={inp} value={counterparty_name} onChange={(e) => setCounterpartyName(e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lb}>지급 금액(원) *</label>
            <input style={inp} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={lb}>지급일</label>
            <input style={inp} type="date" value={payment_date} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lb}>지급 예정일</label>
            <input style={inp} type="date" value={due_date} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label style={lb}>지급 방식</label>
            <select style={inp} value={payment_method}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="transfer">무통장</option>
              <option value="cash">현금</option>
              <option value="card">카드</option>
              <option value="platform">플랫폼</option>
            </select>
          </div>
        </div>

        <label style={lb}>메모</label>
        <textarea style={{ ...inp, minHeight: 64 }} value={memo} onChange={(e) => setMemo(e.target.value)} />

        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
          분배 합계 {formatKRW(sumAllocated)}
          {amtNum > 0 && (
            <> · 잔여(미분배) {formatKRW(remainder)}</>
          )}
        </p>
      </section>

      <section style={{ ...sec, marginTop: 24 }}>
        <h2 style={h2}>미지급 매입에 분배</h2>
        {unpaidPurchases.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 14 }}>미지급·부분지급 매입이 없습니다. 매입 등록 후 이용하세요.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={th}>일자</th>
                  <th style={th}>매입처</th>
                  <th style={th}>품목</th>
                  <th style={{ ...th, textAlign: 'right' }}>매입액</th>
                  <th style={{ ...th, textAlign: 'right' }}>분배 금액</th>
                </tr>
              </thead>
              <tbody>
                {unpaidPurchases.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{p.purchase_date}</td>
                    <td style={td}>{p.counterparty_name}</td>
                    <td style={td}>{p.product_name}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatKRW(p.total_amount)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={allocByPurchase[p.id] ?? ''}
                        onChange={(e) => setAlloc(p.id, e.target.value)}
                        style={{ width: 120, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <div style={{ marginTop: 16 }}>
          <label style={lb}>선지급·미연결 분배(원)</label>
          <input style={{ ...inp, maxWidth: 200 }} type="number" min={0} value={unlinkedAmount}
            onChange={(e) => setUnlinkedAmount(e.target.value)} placeholder="0" />
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>특정 매입에 묶지 않은 금액(선지급)</p>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button type="button" style={btnPrimary} disabled={pending} onClick={submit}>
          {pending ? '저장 중...' : '지급·분배 저장'}
        </button>
        <Link href="/disbursements" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>취소</Link>
      </div>
    </div>
  )
}

const sec: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, background: '#fff' }
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 16px 0' }
const lb: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 12 }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' as const }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const btnPrimary: React.CSSProperties = { padding: '10px 18px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#374151' }
