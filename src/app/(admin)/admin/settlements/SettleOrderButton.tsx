'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { processSettlement } from '@/actions/admin/settlement-control'
import s from '../../admin-shared.module.css'

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
      {open ? (
        <div className={s.modalOverlay} role="dialog" aria-modal="true">
          <div className={s.modalCard}>
            <div className={s.modalTitle}>정산 처리</div>
            <div className={s.modalBody}>
              <div className={s.stackColGap8}>
                <div className={s.inlineMuted}>
                  주문: <strong>{orderNumber}</strong>
                </div>
                <div className={s.inlineMuted}>
                  금액: <strong>{amount.toLocaleString()}원</strong>
                </div>
                <label className={s.stackColGap6}>
                  <div className={s.labelSm}>정산 메모</div>
                  <input
                    className={s.input}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="예: 5/8 정산 처리 (이체완료)"
                    disabled={busy}
                  />
                </label>
                {err && <div className={s.alert}>{err}</div>}
              </div>
            </div>
            <div className={s.modalActions}>
              <button type="button" className={s.ghostBtnMd} onClick={() => setOpen(false)} disabled={busy}>
                취소
              </button>
              <button type="button" className={s.primaryBtnMd} onClick={onConfirm} disabled={busy}>
                {busy ? '처리 중…' : '확인'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

