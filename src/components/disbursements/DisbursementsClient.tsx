'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW } from '@/lib/calc'
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

  function applyFilter() {
    const params = new URLSearchParams()
    if (localStatus) params.set('status', localStatus)
    const q = params.toString()
    router.push(q ? `/disbursements?${q}` : '/disbursements')
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cfg = STATUS_CFG[r.status] ?? {
                  label: r.status,
                  color: '#6b7280',
                  bg:    '#F9FAFB',
                }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
    </>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' as const }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  kpi:       { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:  { fontSize: 11, color: '#9ca3af' },
  kpiVal:    { fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  filterRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  select:    { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn: { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:  { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
}
