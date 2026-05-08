'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { processSettlement } from '@/actions/admin/settlement-control'
import s from '../admin-shared.module.css'

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
  const [memo, setMemo] = useState('')

  async function onConfirm() {
    setBusy(true)
    setErr(null)
    const r = await processSettlement(orderId, memo)
    setBusy(false)
    if (!r.success) {
      setErr(r.error ?? '정산 처리 실패')
      return
    }
    setOpen(false)
    setMemo('')
    router.refresh()
  }

  return (
    <>
      <button type="button" className={s.policyCompactPrimary} onClick={() => setOpen(true)}>
        정산 처리
      </button>
      {open && (
        <div className={s.overlayModal} role="presentation">
          <div className={s.modalBox} role="dialog" aria-modal="true" aria-labelledby="settle-title">
            <h3 id="settle-title" className={s.modalTitle}>
              정산 확인
            </h3>
            <p className={s.modalBody}>
              주문 <strong>{orderNumber}</strong> 에 대해 플랫폼 수수료 정산을 기록합니다. (주문 확정 금액 기준 · 수수료율은{' '}
              <code className={s.code}>admin_settings.platform_fee_rate</code>)
            </p>
            <p className={s.modalMuted}>주문 금액(참고): {amount.toLocaleString()}원</p>
            <div className={s.policyEditGap}>
              <label className={s.policyDesc}>
                정산 메모 (증빙 번호/메모)
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className={s.policyInput}
                  disabled={busy}
                  placeholder="예: 세금계산서 2026-05-08 / 입금확인"
                />
              </label>
            </div>
            {err && (
              <p className={s.modalAlert} role="alert">
                {err}
              </p>
            )}
            <div className={s.modalFooter}>
              <button type="button" className={s.policyCompactGhost} onClick={() => setOpen(false)} disabled={busy}>
                취소
              </button>
              <button type="button" className={s.policyCompactPrimary} onClick={onConfirm} disabled={busy}>
                {busy ? '처리 중…' : '확인 후 정산'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
