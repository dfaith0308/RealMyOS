'use client'

import { useMemo, useState } from 'react'
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
function formatDate(s: string | null | undefined) { return s ? s.slice(0, 10) : '-' }

type TabKey = 'all' | 'need_convert' | 'expiring' | 'partial' | 'expired'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'need_convert', label: '전환 필요' },
  { key: 'expiring', label: '유효기간 임박' },
  { key: 'partial', label: '부분 전환' },
  { key: 'expired', label: '만료' },
]

function calcConversionRate(q: Quote): number {
  const total = q.total_quantity ?? 0
  const conv = q.converted_quantity ?? 0
  if (total <= 0) return 0
  return Math.round((conv / total) * 100)
}

export default function QuoteListClient({ initialQuotes }: { initialQuotes: Quote[] }) {
  const [quotes, setQuotes]     = useState(initialQuotes)
  const [search,  setSearch]    = useState('')
  const [tab,     setTab]       = useState<TabKey>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
    return quotes.filter((q) => {
      const matchSearch = !search || (q.customer_name ?? '').includes(search) || (q.quote_number ?? '').includes(search)
      if (!matchSearch) return false

      const convRate = calcConversionRate(q)
      const isExpiring = !!q.expires_at && q.expires_at >= today && q.expires_at <= new Date(Date.now() + 9 * 3600000 + 3 * 86400000).toISOString().slice(0, 10)

      if (tab === 'all') return true
      if (tab === 'expired') return q.status === 'expired'
      if (tab === 'partial') return q.status === 'partially_converted'
      if (tab === 'need_convert') return q.status === 'sent' && (q.converted_quantity ?? 0) === 0
      if (tab === 'expiring') return isExpiring && q.status !== 'converted' && q.status !== 'expired'
      // fallback
      return convRate >= 0
    })
  }, [quotes, search, tab])

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
        <Link href="/quotes/new" style={{
          padding: '9px 18px', background: '#111827', color: '#fff',
          borderRadius: 8, fontSize: 14, textDecoration: 'none', fontWeight: 500,
        }}>+ 견적 등록</Link>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid ' + (tab === t.key ? '#111827' : '#e5e7eb'),
              background: tab === t.key ? '#111827' : '#fff',
              color: tab === t.key ? '#fff' : '#374151',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          placeholder="견적번호/거래처명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                {['견적번호', '거래처명', '견적일', '유효기간', '총금액', '전환율', '상태', '담당자', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => {
                const st = STATUS_LABEL[q.status]
                const convRate = calcConversionRate(q)
                const owner = q.created_by ? q.created_by.slice(0, 8) : '-'
                return (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>{q.quote_number ?? '-'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{q.customer_name}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{formatDate(q.quote_date ?? q.created_at)}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{q.expires_at ? formatDate(q.expires_at) : '-'}</td>
                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{formatKRW(q.total_amount)}</td>
                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: convRate === 100 ? '#16A34A' : '#111827', fontWeight: 600 }}>
                      {convRate}%
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: st.color + '20', color: st.color, fontWeight: 600 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontFamily: 'monospace' }}>{owner}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/quotes/${q.id}`}
                          style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none' }}>상세</Link>
                        {tab === 'need_convert' && (
                          <Link href={`/sales/exec?customer_id=${encodeURIComponent(q.customer_id)}`}
                            style={{ fontSize: 12, color: '#111827', textDecoration: 'none' }}>즉시 연락</Link>
                        )}
                        {tab === 'expiring' && (
                          <Link href={`/sales/exec?customer_id=${encodeURIComponent(q.customer_id)}`}
                            style={{ fontSize: 12, color: '#111827', textDecoration: 'none' }}>리마인드</Link>
                        )}
                        {tab === 'partial' && (
                          <Link href={`/quotes/${q.id}`}
                            style={{ fontSize: 12, color: '#111827', textDecoration: 'none' }}>추가 제안</Link>
                        )}
                        {tab === 'expired' && (
                          <Link href={`/quotes/new?requote=${encodeURIComponent(q.id)}`}
                            style={{ fontSize: 12, color: '#111827', textDecoration: 'none' }}>재견적</Link>
                        )}
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
