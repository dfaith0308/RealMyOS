'use client'

import { useState, useTransition } from 'react'
import {
  createCollectionSchedule,
  updateCollectionSchedule,
  cancelCollectionSchedule,
} from '@/actions/collection'
import type { CollectionSchedule } from '@/actions/collection'

interface Props {
  customerId:    string
  customerName:  string
  existing?:     CollectionSchedule | null   // 기존 pending 예정
  onClose:       () => void
}

const METHOD_LABEL = { card: '💳 카드', cash: '💵 현금', transfer: '🏦 계좌이체' } as const
type Method = keyof typeof METHOD_LABEL

export default function CollectionScheduleModal({
  customerId, customerName, existing, onClose,
}: Props) {
  const todayKST = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

  const [date,   setDate]   = useState(existing?.scheduled_date ?? todayKST)
  const [method, setMethod] = useState<Method>((existing?.method as Method) ?? 'transfer')
  const [note,   setNote]   = useState(existing?.note ?? '')
  const [error,  setError]  = useState('')
  const [isPending, start]  = useTransition()

  function handleSave() {
    if (!date) { setError('날짜를 선택해주세요.'); return }
    start(async () => {
      const r = existing
        ? await updateCollectionSchedule(existing.id, { scheduled_date: date, method, note })
        : await createCollectionSchedule({ customer_id: customerId, scheduled_date: date, method, note })
      if (r.success) onClose()
      else setError(r.error ?? '저장 실패')
    })
  }

  function handleCancel() {
    if (!existing) return
    start(async () => {
      const r = await cancelCollectionSchedule(existing.id)
      if (r.success) onClose()
      else setError(r.error ?? '취소 실패')
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 360, maxWidth: '95vw' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              🗓 {existing ? '수금 예정 수정' : '수금 예정 등록'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{customerName}</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {/* 날짜 */}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>수금 예정일</div>
          <input type="date" style={input} value={date} min={todayKST}
            onChange={e => setDate(e.target.value)} />
        </div>

        {/* 결제 방법 */}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>결제 방법</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['transfer', 'card', 'cash'] as Method[]).map(m => (
              <button key={m} onClick={() => setMethod(m)}
                style={{ flex: 1, padding: '8px 0', border: `2px solid ${method === m ? '#111827' : '#e5e7eb'}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', background: method === m ? '#111827' : '#fff', color: method === m ? '#fff' : '#374151', fontWeight: method === m ? 600 : 400 }}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {/* 메모 */}
        <div style={{ marginBottom: 18 }}>
          <div style={label}>메모 (선택)</div>
          <textarea style={{ ...input, height: 60, resize: 'none' }}
            placeholder="수금 관련 메모"
            value={note}
            onChange={e => setNote(e.target.value)} />
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {existing && (
            <button onClick={handleCancel} disabled={isPending}
              style={{ padding: '10px 14px', border: '1px solid #FCA5A5', borderRadius: 8, background: '#fff', color: '#B91C1C', fontSize: 13, cursor: 'pointer' }}>
              예정 취소
            </button>
          )}
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
            닫기
          </button>
          <button onClick={handleSave} disabled={isPending}
            style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 8, background: isPending ? '#93C5FD' : '#111827', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {isPending ? '저장 중...' : existing ? '수정 저장' : '예정 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }
const input: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }