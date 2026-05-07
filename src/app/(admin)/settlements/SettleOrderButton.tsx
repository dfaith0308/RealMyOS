'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { processSettlement } from '@/actions/admin/settlement-control'

export default function SettleOrderButton({
  orderId,
  orderNumber,
  amount,
}: {
  orderId: string
  orderNumber: string
  amount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onConfirm() {
    setBusy(true)
    setErr(null)
    const r = await processSettlement(orderId)
    setBusy(false)
    if (!r.success) {
      setErr(r.error ?? '정산 처리 실패')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>
        정산 처리
      </button>
      {open && (
        <div style={overlay} role="presentation">
          <div style={modal} role="dialog" aria-modal="true" aria-labelledby="settle-title">
            <h3 id="settle-title" style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>
              정산 확인
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
              주문 <strong>{orderNumber}</strong> 에 대해 플랫폼 수수료 정산을 기록합니다. (주문 확정 금액 기준 · 수수료율은{' '}
              <code style={{ fontSize: 12 }}>admin_settings.platform_fee_rate</code>)
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#6b7280' }}>주문 금액(참고): {amount.toLocaleString()}원</p>
            {err && (
              <p style={{ margin: '12px 0 0', fontSize: 13, color: '#DC2626', fontWeight: 700 }} role="alert">
                {err}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" style={btnGhost} onClick={() => setOpen(false)} disabled={busy}>
                취소
              </button>
              <button type="button" style={btnPrimary} onClick={onConfirm} disabled={busy}>
                {busy ? '처리 중…' : '확인 후 정산'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: 16,
}

const modal: React.CSSProperties = {
  width: 'min(440px, 100%)',
  background: '#fff',
  borderRadius: 14,
  padding: '22px 20px',
  boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: '#111827',
  border: '1px solid #e5e7eb',
}
