'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { submitRfqBid } from '@/actions/rfq'
import type { SupplierRfqRow } from '@/actions/rfq'
import { formatKRW } from '@/lib/calc'

type Props = {
  detail: SupplierRfqRow
  hasExistingBid: boolean
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function RfqDetailClient({ detail, hasExistingBid }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bidDone, setBidDone] = useState(hasExistingBid)
  const [error, setError] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [deliveryDays, setDeliveryDays] = useState('')
  const [note, setNote] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const p = Number(price.replace(/,/g, ''))
    if (!Number.isFinite(p) || p <= 0) {
      setError('유효한 제안 단가를 입력해주세요.')
      return
    }
    let ddays: number | null = null
    if (deliveryDays.trim() !== '') {
      const n = parseInt(deliveryDays, 10)
      if (!Number.isInteger(n) || n < 0) {
        setError('납기(일)는 0 이상의 정수로 입력해주세요.')
        return
      }
      ddays = n
    }

    startTransition(async () => {
      const res = await submitRfqBid({
        rfq_id: detail.id,
        price: Math.round(p),
        delivery_days: ddays,
        note: note.trim() || undefined,
      })
      if (!res.success) {
        setError(res.error ?? '입찰에 실패했습니다.')
        return
      }
      setBidDone(true)
      router.refresh()
    })
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link href="/rfq" style={{ fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none' }}>
          ← 발주요청 목록
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 8px' }}>{detail.product_name}</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          수량 {detail.quantity}{detail.unit ? ` ${detail.unit}` : ''}
          {detail.target_price != null && ` · 목표가 ${formatKRW(detail.target_price)}`}
        </p>
      </div>

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.6,
        }}>
        <div><strong>마감</strong> {fmtDate(detail.deadline)}</div>
        <div><strong>지역</strong> {detail.region ?? '—'}</div>
        <div><strong>상태</strong> {detail.status}</div>
        <div><strong>등록</strong> {fmtDate(detail.created_at)}</div>
      </div>

      {bidDone ? (
        <div
          style={{
            padding: 16,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 12,
            color: '#047857',
            fontWeight: 600,
          }}>
          입찰이 완료되었습니다.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>입찰하기</h2>
          {error && (
            <p style={{ color: '#b91c1c', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
          )}
          <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
            제안 단가 (원) <span style={{ color: '#b91c1c' }}>*</span>
            <input
              type="text"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
            납기 (일, 선택)
            <input
              type="text"
              inputMode="numeric"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(e.target.value)}
              placeholder="예: 3"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
            메모 (선택)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical' as const,
              }}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            style={{
              padding: '10px 20px',
              background: pending ? '#9ca3af' : '#111827',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer',
            }}>
            {pending ? '제출 중…' : '입찰 제출'}
          </button>
        </form>
      )}
    </>
  )
}
