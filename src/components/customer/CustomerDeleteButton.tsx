'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCustomer } from '@/actions/customer'

interface Props {
  customerId: string
  customerName: string
}

export default function CustomerDeleteButton({ customerId, customerName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const r = await deleteCustomer(customerId)
      if (r.success) {
        setShowConfirm(false)
        router.refresh()
      } else {
        setError(r.error ?? '삭제 실패')
        setShowConfirm(false)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        style={s.deleteBtn}
        onClick={() => setShowConfirm(true)}
        disabled={isPending}>
        삭제
      </button>

      {error && (
        <span style={{ fontSize: 11, color: '#B91C1C', marginLeft: 4 }}>{error}</span>
      )}

      {showConfirm && (
        <div style={s.overlay} onClick={() => setShowConfirm(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <p style={s.title}>거래처 삭제</p>
            <p style={s.desc}>
              <strong>{customerName}</strong>을(를) 삭제하시겠습니까?<br />
              확정 주문 또는 수금 내역이 있으면 삭제할 수 없습니다.
            </p>
            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={() => setShowConfirm(false)}>
                취소
              </button>
              <button style={isPending ? s.confirmOff : s.confirmBtn}
                onClick={handleDelete} disabled={isPending}>
                {isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  deleteBtn:  { padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', cursor: 'pointer' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:      { background: '#fff', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  title:      { fontSize: 16, fontWeight: 600, color: '#B91C1C', margin: '0 0 8px 0' },
  desc:       { fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '0 0 16px 0' },
  btnRow:     { display: 'flex', gap: 8 },
  cancelBtn:  { flex: 1, padding: '10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  confirmBtn: { flex: 1, padding: '10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  confirmOff: { flex: 1, padding: '10px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
}
