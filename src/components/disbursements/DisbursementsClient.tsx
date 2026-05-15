'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelDisbursement } from '@/actions/payment'
import { formatKRW } from '@/lib/calc'
import { PAYMENTS_TYPE_PAYOUT_OUTBOUND } from '@/lib/inbound-payment-superseded'
import type { DisbursementListItem } from '@/actions/payment'

const METHOD_LABEL: Record<string, string> = {
  transfer: '무통장', cash: '현금', card: '카드', platform: '플랫폼',
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '대기',  color: '#B45309', bg: '#FFFBEB' },
  confirmed: { label: '확정',  color: '#15803D', bg: '#F0FDF4' },
  reversed:  { label: '취소',  color: '#B91C1C', bg: '#FEF2F2' },
  planned:   { label: '예정',  color: '#4B5563', bg: '#F3F4F6' },
}

interface Props {
  rows:    DisbursementListItem[]
  filters: { status: string }
}

export default function DisbursementsClient({ rows, filters }: Props) {
  const router = useRouter()
  const [localStatus, setLocalStatus] = useState(filters.status)
  const [pending, startTransition] = useTransition()
  const [cancelTarget, setCancelTarget] = useState<DisbursementListItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  function applyFilter() {
    const params = new URLSearchParams()
    if (localStatus) params.set('status', localStatus)
    const q = params.toString()
    router.push(q ? `/disbursements?${q}` : '/disbursements')
  }

  function handleCancel() {
    if (!cancelTarget) return
    setError(null)
    startTransition(async () => {
      const res = await cancelDisbursement(cancelTarget.id)
      if (!res.success) {
        setError(res.error ?? '취소 실패')
        return
      }
      setCancelTarget(null)
      router.refresh()
    })
  }

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>목록 합계 ({rows.length}건)</span>
          <span style={{ ...s.kpiVal, color: '#111827' }}>{formatKRW(total)}</span>
        </div>
      </div>

      <div style={s.filterRow}>
        <select value={localStatus} style={s.select}
          onChange={(e) => setLocalStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="pending">pending</option>
          <option value="confirmed">confirmed</option>
          <option value="reversed">reversed</option>
        </select>
        <button type="button" style={s.searchBtn} onClick={applyFilter}>적용</button>
        <button type="button" style={s.resetBtn} onClick={() => router.push('/disbursements')}>초기화</button>
      </div>

      {rows.length === 0
        ? <p style={{ color: '#9ca3af', fontSize: 14 }}>지급 내역이 없습니다.</p>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>거래처명</th>
                <th style={{ ...th, textAlign: 'right' }}>금액</th>
                <th style={th}>지급예정일</th>
                <th style={th}>상태</th>
                <th style={th}>결제수단</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cfg = STATUS_CFG[r.status] ?? {
                  label: r.status,
                  color: '#6b7280',
                  bg:    '#F9FAFB',
                }
                const isReversed = r.status === 'reversed'
                const isPayoutOutbound = String(r.type ?? '').trim() === PAYMENTS_TYPE_PAYOUT_OUTBOUND
                const showCancelBtn = r.status === 'pending' && !isPayoutOutbound
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6',
                    opacity: isReversed ? 0.55 : 1,
                    textDecoration: isReversed ? 'line-through' : 'none' }}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {r.counterparty_name?.trim() || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatKRW(r.amount)}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
                      {r.due_date ?? '—'}
                    </td>
                    <td style={td}>
                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11,
                        fontWeight: 600, color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ ...td, color: '#6b7280' }}>
                      {METHOD_LABEL[r.payment_method] ?? r.payment_method}
                    </td>
                    <td style={td}>
                      {showCancelBtn ? (
                        <button type="button" style={s.cancelBtn}
                          onClick={() => setCancelTarget(r)}>
                          취소
                        </button>
                      ) : r.status === 'pending' && isPayoutOutbound ? (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>수동 처리 필요</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

      {cancelTarget && (
        <div style={s.overlay} onClick={() => { if (!pending) setCancelTarget(null) }}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#B91C1C', margin: '0 0 8px 0' }}>지급 취소</p>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 8px 0', lineHeight: 1.6 }}>
              {cancelTarget.counterparty_name?.trim() || '—'} — {formatKRW(cancelTarget.amount)}
              <br />취소 시 연결된 매입의 지급 상태가 자동 재계산됩니다.
            </p>
            {error && <p style={{ color: '#B91C1C', fontSize: 12, margin: '8px 0 12px 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={s.modalCancelBtn} disabled={pending}
                onClick={() => setCancelTarget(null)}>아니오</button>
              <button type="button" style={pending ? s.modalConfirmOff : s.modalConfirmBtn}
                onClick={handleCancel} disabled={pending}>
                {pending ? '처리 중...' : '네, 취소합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' as const }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  kpi:             { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:        { fontSize: 11, color: '#9ca3af' },
  kpiVal:          { fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  filterRow:       { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  select:          { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn:       { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:        { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  cancelBtn:       { padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', cursor: 'pointer' },
  overlay:         { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:           { background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalCancelBtn:  { flex: 1, padding: '10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  modalConfirmBtn: { flex: 2, padding: '10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  modalConfirmOff: { flex: 2, padding: '10px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
}
