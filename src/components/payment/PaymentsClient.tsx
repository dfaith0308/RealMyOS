'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cancelPayment } from '@/actions/payment'
import { formatKRW } from '@/lib/calc'
import type { PaymentListItem } from '@/actions/payment'

const METHOD_LABEL: Record<string, string> = {
  transfer: '무통장', cash: '현금', card: '카드', platform: '플랫폼',
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: '정상',  color: '#15803D', bg: '#F0FDF4' },
  cancelled: { label: '취소',  color: '#B91C1C', bg: '#FEF2F2' },
}

interface Props {
  payments:  PaymentListItem[]
  customers: { id: string; name: string }[]
  filters:   { from: string; to: string; customer_id: string; status: string }
}

export default function PaymentsClient({ payments, customers, filters }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cancelTarget, setCancelTarget] = useState<PaymentListItem | null>(null)
  const [localFilters, setLocalFilters] = useState(filters)

  const totalConfirmed = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0)
  const totalDeposit = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + (p.deposit_amount ?? 0), 0)

  function applyFilters() {
    const params = new URLSearchParams()
    if (localFilters.from)        params.set('from',        localFilters.from)
    if (localFilters.to)          params.set('to',          localFilters.to)
    if (localFilters.customer_id) params.set('customer_id', localFilters.customer_id)
    if (localFilters.status)      params.set('status',      localFilters.status)
    router.push(`/payments?${params.toString()}`)
  }

  function handleCancel() {
    if (!cancelTarget) return
    startTransition(async () => {
      await cancelPayment(cancelTarget.id)
      setCancelTarget(null)
      router.refresh()
    })
  }

  return (
    <>
      {/* 요약 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>수금 합계</span>
          <span style={{ ...s.kpiVal, color: '#15803D' }}>{formatKRW(totalConfirmed)}</span>
        </div>
        {totalDeposit > 0 && (
          <div style={s.kpi}>
            <span style={s.kpiLabel}>예치금 포함</span>
            <span style={{ ...s.kpiVal, color: '#1D4ED8' }}>{formatKRW(totalDeposit)}</span>
          </div>
        )}
      </div>

      {/* 필터 */}
      <div style={s.filterRow}>
        <input type="date" value={localFilters.from} style={s.input}
          onChange={(e) => setLocalFilters((p) => ({ ...p, from: e.target.value }))} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
        <input type="date" value={localFilters.to} style={s.input}
          onChange={(e) => setLocalFilters((p) => ({ ...p, to: e.target.value }))} />
        <select value={localFilters.customer_id} style={s.select}
          onChange={(e) => setLocalFilters((p) => ({ ...p, customer_id: e.target.value }))}>
          <option value="">전체 거래처</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={localFilters.status} style={s.select}
          onChange={(e) => setLocalFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="">전체 상태</option>
          <option value="confirmed">정상</option>
          <option value="cancelled">취소</option>
        </select>
        <button style={s.searchBtn} onClick={applyFilters}>검색</button>
        <button style={s.resetBtn}  onClick={() => router.push('/payments')}>초기화</button>
      </div>

      {/* 테이블 */}
      {payments.length === 0
        ? <p style={{ color: '#9ca3af', fontSize: 14 }}>수금 내역이 없습니다.</p>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>수금일</th>
                <th style={th}>거래처</th>
                <th style={{ ...th, textAlign: 'right' }}>수금액</th>
                {totalDeposit > 0 && <th style={{ ...th, textAlign: 'right' }}>예치금</th>}
                <th style={th}>방식</th>
                <th style={th}>메모</th>
                <th style={th}>상태</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.confirmed
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6',
                    opacity: p.status === 'cancelled' ? 0.55 : 1,
                    textDecoration: p.status === 'cancelled' ? 'line-through' : 'none' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
                      {p.payment_date}
                    </td>
                    <td style={td}>
                      <Link href={`/customers/${p.customer_id}`}
                        style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}>
                        {p.customer_name}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatKRW(p.amount)}
                    </td>
                    {totalDeposit > 0 && (
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: p.deposit_amount > 0 ? '#1D4ED8' : '#d1d5db', fontSize: 12 }}>
                        {p.deposit_amount > 0 ? `+${formatKRW(p.deposit_amount)}` : '-'}
                      </td>
                    )}
                    <td style={{ ...td, color: '#6b7280' }}>
                      {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                    </td>
                    <td style={{ ...td, color: '#9ca3af', maxWidth: 160,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.memo ?? '-'}
                    </td>
                    <td style={td}>
                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11,
                        fontWeight: 600, color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={td}>
                      {p.status === 'confirmed' && (
                        <button style={s.cancelBtn}
                          onClick={() => setCancelTarget(p)}>
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

      {/* 취소 확인 모달 */}
      {cancelTarget && (
        <div style={s.overlay} onClick={() => setCancelTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#B91C1C', margin: '0 0 8px 0' }}>수금 취소</p>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 16px 0', lineHeight: 1.6 }}>
              {cancelTarget.customer_name} — {formatKRW(cancelTarget.amount)}<br />
              ({cancelTarget.payment_date})<br />
              취소하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.modalCancelBtn} onClick={() => setCancelTarget(null)}>아니오</button>
              <button style={isPending ? s.modalConfirmOff : s.modalConfirmBtn}
                onClick={handleCancel} disabled={isPending}>
                {isPending ? '처리 중...' : '네, 취소합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  kpi:            { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:       { fontSize: 11, color: '#9ca3af' },
  kpiVal:         { fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  filterRow:      { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  input:          { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:         { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn:      { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:       { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  cancelBtn:      { padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 11, color: '#B91C1C', cursor: 'pointer' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:          { background: '#fff', borderRadius: 12, padding: 24, width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalCancelBtn: { flex: 1, padding: '10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  modalConfirmBtn:{ flex: 2, padding: '10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  modalConfirmOff:{ flex: 2, padding: '10px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
}
