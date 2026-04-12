'use client'

import { useState } from 'react'
import type { SalesHistory } from '@/actions/sales'

const OUTCOME_LABEL: Record<string, { label: string; color: string }> = {
  interested:         { label: '관심있음',   color: '#16A34A' },
  potential:          { label: '잠재고객',   color: '#2563EB' },
  maintained:         { label: '유지',       color: '#6b7280' },
  churn_risk:         { label: '이탈위험',   color: '#DC2626' },
  competitor:         { label: '경쟁사이용', color: '#7C3AED' },
  rejected:           { label: '거절',       color: '#EF4444' },
  no_answer:          { label: '부재중',     color: '#9ca3af' },
  callback_requested: { label: '콜백요청',   color: '#D97706' },
  order_placed:       { label: '주문완료',   color: '#059669' },
}

const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  regular: '단골', new: '신규', churn: '이탈', dormant: '휴면',
}

const METHOD_ICON: Record<string, string> = {
  call: '📞', message: '💬', visit: '🚗', kakao: '🟡',
}

export default function SalesHistoryClient({ initialHistory }: { initialHistory: SalesHistory[] }) {
  const [search, setSearch] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')

  const filtered = initialHistory.filter(h => {
    const matchSearch  = !search || h.customer_name.includes(search)
    const matchOutcome = !filterOutcome || (h as any).outcome_type === filterOutcome
    return matchSearch && matchOutcome
  })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system, "Noto Sans KR", sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>영업 이력</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 180 }}
            placeholder="거래처명 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)} />
          <select
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
            value={filterOutcome}
            onChange={e => setFilterOutcome(e.target.value)}>
            <option value="">전체 결과</option>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>
          영업 기록이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(h => {
            const ot = (h as any).outcome_type as string | null
            const cs = (h as any).customer_status as string | null
            const om = (h as any).outcome_memo as string | null
            const ms = (h as any).methods as string[] | null
            const outcomeInfo = ot ? OUTCOME_LABEL[ot] : null

            return (
              <div key={h.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  {/* 왼쪽: 거래처 + 행동 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{h.customer_name}</span>
                    {/* methods 배열 또는 단일 contact_method */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {ms && ms.length > 0
                        ? ms.map(m => <span key={m} style={{ fontSize: 16 }}>{METHOD_ICON[m] ?? m}</span>)
                        : <span style={{ fontSize: 16 }}>{METHOD_ICON[h.contact_method] ?? h.contact_method}</span>
                      }
                    </div>
                    {cs && (
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>
                        {CUSTOMER_STATUS_LABEL[cs] ?? cs}
                      </span>
                    )}
                  </div>
                  {/* 오른쪽: 결과 + 날짜 */}
                  <div style={{ textAlign: 'right' }}>
                    {outcomeInfo && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: outcomeInfo.color + '20', color: outcomeInfo.color, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                        {outcomeInfo.label}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      {h.contacted_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                </div>

                {/* 메모 */}
                {om && (
                  <div style={{ fontSize: 13, color: '#374151', background: '#f9fafb', borderRadius: 7, padding: '8px 10px', lineHeight: 1.5 }}>
                    {om}
                  </div>
                )}

                {/* 다음 행동 */}
                {h.next_action_date && (
                  <div style={{ fontSize: 11, color: '#D97706', marginTop: 8 }}>
                    📅 다음: {h.next_action_date} {h.next_action_type ? `(${METHOD_ICON[h.next_action_type]})` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}