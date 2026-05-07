'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPurchase } from '@/actions/purchase'
import { todayStr } from '@/lib/calc'

export default function PurchaseCreateClient() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [counterparty_name, setCounterpartyName] = useState('')
  const [product_name, setProductName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [unit_price, setUnitPrice] = useState('')
  const [total_amount, setTotalAmount] = useState('')
  const [purchase_date, setPurchaseDate] = useState(todayStr())
  const [memo, setMemo] = useState('')

  function submit() {
    setError(null)
    const q = Number(quantity)
    const up = Number(unit_price)
    const ta = Number(total_amount)
    startTransition(async () => {
      const res = await createPurchase({
        counterparty_name,
        product_name,
        quantity:     q,
        unit:         unit.trim() || null,
        unit_price:   up,
        total_amount: ta,
        purchase_date,
        memo:         memo.trim() || null,
      })
      if (!res.success) {
        setError(res.error ?? '저장 실패')
        return
      }
      router.push('/purchases')
      router.refresh()
    })
  }

  return (
    <div style={{ maxWidth: 480 }}>
      {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <label style={lb}>매입처명 *</label>
      <input style={inp} value={counterparty_name} onChange={(e) => setCounterpartyName(e.target.value)} />

      <label style={lb}>품목명 *</label>
      <input style={inp} value={product_name} onChange={(e) => setProductName(e.target.value)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lb}>수량 *</label>
          <input style={inp} type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label style={lb}>단위</label>
          <input style={inp} value={unit} placeholder="kg, box" onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>

      <label style={lb}>단가(원) *</label>
      <input style={inp} type="number" min={1} value={unit_price} onChange={(e) => setUnitPrice(e.target.value)} />

      <label style={lb}>합계 금액(원) *</label>
      <input style={inp} type="number" min={1} value={total_amount} onChange={(e) => setTotalAmount(e.target.value)} />

      <label style={lb}>매입일</label>
      <input style={inp} type="date" value={purchase_date} onChange={(e) => setPurchaseDate(e.target.value)} />

      <label style={lb}>메모</label>
      <textarea style={{ ...inp, minHeight: 72 }} value={memo} onChange={(e) => setMemo(e.target.value)} />

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="button" style={btnPrimary} disabled={pending} onClick={submit}>
          {pending ? '저장 중...' : '매입 등록'}
        </button>
        <Link href="/purchases" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>취소</Link>
      </div>
    </div>
  )
}

const lb: React.CSSProperties = { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 12 }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }
const btnPrimary: React.CSSProperties = { padding: '10px 18px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '10px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#374151' }
