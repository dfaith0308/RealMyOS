'use client'

import { useState } from 'react'
import type { SalesHistory } from '@/actions/sales'

const METHOD_LABEL: Record<string, string> = {
  call: '📞 전화', call_attempt: '📞 시도', message: '💬 문자', visit: '🚗 방문', payment: '💰 수금',
}
const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  connected:  { label: '연결됨',   color: '#16A34A' },
  no_answer:  { label: '부재중',   color: '#6b7280' },
  interested: { label: '관심있음', color: '#2563EB' },
  rejected:   { label: '거절',     color: '#DC2626' },
  scheduled:  { label: '예약됨',   color: '#D97706' },
}

export default function SalesHistoryClient({ initialHistory }: { initialHistory: SalesHistory[] }) {
  const [search, setSearch] = useState('')

  const filtered = initialHistory.filter((h) =>
    !search || h.customer_name.includes(search)
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>영업 이력</h1>
        <input
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 220 }}
          placeholder="거래처명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>영업 기록이 없습니다.</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['일시', '거래처', '방법', '결과', '메모', '다음 예약'].map((h) => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => {
                const resultInfo = h.result ? RESULT_LABEL[h.result] : null
                return (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {h.contacted_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td style={{ padding: '9px 14px', fontWeight: 500 }}>{h.customer_name}</td>
                    <td style={{ padding: '9px 14px' }}>{METHOD_LABEL[h.contact_method] ?? h.contact_method}</td>
                    <td style={{ padding: '9px 14px' }}>
                      {resultInfo ? (
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: resultInfo.color + '20', color: resultInfo.color }}>
                          {resultInfo.label}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '9px 14px', color: '#6b7280', maxWidth: 200 }}>{h.memo || ''}</td>
                    <td style={{ padding: '9px 14px', color: h.next_action_date ? '#D97706' : '#9ca3af', fontSize: 12 }}>
                      {h.next_action_date ? `${h.next_action_date} ${h.next_action_type ?? ''}` : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
