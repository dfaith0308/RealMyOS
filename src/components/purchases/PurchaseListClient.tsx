'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW } from '@/lib/calc'
import type { PurchaseListItem } from '@/actions/purchase'

const STATUS_LABEL: Record<string, string> = {
  unpaid: '미지급', partial: '부분', paid: '완료',
}

interface Props {
  rows:    PurchaseListItem[]
  filters: { status: string }
}

export default function PurchaseListClient({ rows, filters }: Props) {
  const router = useRouter()
  const [localStatus, setLocalStatus] = useState(filters.status)

  function applyFilter() {
    const params = new URLSearchParams()
    if (localStatus) params.set('status', localStatus)
    const q = params.toString()
    router.push(q ? `/purchases?${q}` : '/purchases')
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={localStatus} style={s.select}
          onChange={(e) => setLocalStatus(e.target.value)}>
          <option value="">전체 상태</option>
          <option value="unpaid">미지급</option>
          <option value="partial">부분</option>
          <option value="paid">완료</option>
        </select>
        <button type="button" style={s.searchBtn} onClick={applyFilter}>적용</button>
        <button type="button" style={s.resetBtn} onClick={() => router.push('/purchases')}>초기화</button>
      </div>

      {rows.length === 0
        ? <p style={{ color: '#9ca3af', fontSize: 14 }}>매입 내역이 없습니다.</p>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={th}>일자</th>
                <th style={th}>매입처</th>
                <th style={th}>품목</th>
                <th style={{ ...th, textAlign: 'right' }}>수량</th>
                <th style={{ ...th, textAlign: 'right' }}>합계</th>
                <th style={th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>
                    {r.purchase_date}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{r.counterparty_name}</td>
                  <td style={td}>{r.product_name}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.quantity}{r.unit ? ` ${r.unit}` : ''}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatKRW(r.total_amount)}
                  </td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      color: r.status === 'paid' ? '#15803D' : r.status === 'partial' ? '#B45309' : '#4B5563',
                      background: r.status === 'paid' ? '#F0FDF4' : r.status === 'partial' ? '#FFFBEB' : '#F3F4F6' }}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' as const }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  select:    { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff' },
  searchBtn: { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:  { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
}
