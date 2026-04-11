'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteQuote } from '@/actions/quote'
import type { Quote, QuoteStatus } from '@/types/quote'

const STATUS_LABEL: Record<QuoteStatus, { label: string; color: string }> = {
  draft:               { label: '초안',     color: '#6b7280' },
  sent:                { label: '발송됨',   color: '#2563EB' },
  partially_converted: { label: '일부전환', color: '#D97706' },
  converted:           { label: '전환완료', color: '#16A34A' },
  expired:             { label: '만료',     color: '#DC2626' },
}

function formatKRW(n: number) { return n.toLocaleString() + '원' }
function formatDate(s: string) { return s?.slice(0, 10) ?? '-' }

export default function QuoteListClient({ initialQuotes }: { initialQuotes: Quote[] }) {
  const [quotes, setQuotes]     = useState(initialQuotes)
  const [search,  setSearch]    = useState('')
  const [filter,  setFilter]    = useState<QuoteStatus | ''>('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = quotes.filter((q) => {
    const matchSearch = !search || q.customer_name?.includes(search)
    const matchFilter = !filter || q.status === filter
    return matchSearch && matchFilter
  })

  async function handleDelete(id: string) {
    if (!confirm('견적을 삭제하시겠습니까?')) return
    setDeleting(id)
    await deleteQuote(id)
    setQuotes((prev) => prev.filter((q) => q.id !== id))
    setDeleting(null)
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>견적 관리</h1>
        <Link href="/orders/quotes/new" style={{
          padding: '9px 18px', background: '#111827', color: '#fff',
          borderRadius: 8, fontSize: 14, textDecoration: 'none', fontWeight: 500,
        }}>+ 견적 등록</Link>
      </div>

      {/* 검색/필터 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          placeholder="거래처명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value as QuoteStatus | '')}
        >
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>
          견적이 없습니다.
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['거래처', '견적일', '유효기간', '금액', '상태', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => {
                const st = STATUS_LABEL[q.status]
                return (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{q.customer_name}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{formatDate(q.created_at)}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{q.expires_at ? formatDate(q.expires_at) : '-'}</td>
                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{formatKRW(q.total_amount)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: st.color + '20', color: st.color, fontWeight: 600 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/orders/quotes/${q.id}`}
                          style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none' }}>상세</Link>
                        {q.status !== 'converted' && (
                          <button
                            onClick={() => handleDelete(q.id)}
                            disabled={deleting === q.id}
                            style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            삭제
                          </button>
                        )}
                      </div>
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
