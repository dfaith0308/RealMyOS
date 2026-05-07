import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import type { MarginResult } from '@/actions/analytics'

const SORTS: { id: 'margin' | 'contribution' | 'qty'; label: string }[] = [
  { id: 'margin',       label: '마진순' },
  { id: 'contribution', label: '기여도순' },
  { id: 'qty',          label: '수량순' },
]

export default function MarginTab({
  data, sort, from, to,
}: {
  data: MarginResult; sort: string; from: string; to: string
}) {
  const rows = [...data.rows].sort((a, b) => {
    if (sort === 'qty')          return b.quantity - a.quantity
    if (sort === 'contribution') return b.margin_contribution - a.margin_contribution
    return b.margin - a.margin
  })

  return (
    <>
      <div style={s.toolbar}>
        <div style={s.sortRow}>
          {SORTS.map((opt) => {
            const sp = new URLSearchParams({ tab: 'margin', from, to, sort: opt.id })
            return (
              <Link key={opt.id} href={`/analytics?${sp.toString()}`} style={{
                ...s.sortBtn,
                borderColor: sort === opt.id ? '#1D4ED8' : '#e5e7eb',
                color:       sort === opt.id ? '#1D4ED8' : '#6b7280',
                fontWeight:  sort === opt.id ? 600       : 400,
              }}>
                {opt.label}
              </Link>
            )
          })}
        </div>
        <div style={s.shareBox}>
          <span style={s.shareLb}>상위 5개 매출 비중</span>
          <span style={s.shareVal}>
            {(Math.round(data.top5_revenue_share * 10) / 10).toFixed(1)}%
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={s.empty}>해당 기간 매출 데이터가 없습니다</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>상품명</th>
                <th style={{ ...s.th, textAlign: 'right' }}>판매수량</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>원가</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진 기여도</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_name} style={s.row}>
                  <td style={s.td}>{r.product_name}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{r.quantity.toLocaleString()}</span></td>
                  <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(r.revenue)}</span></td>
                  <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(r.cost)}</span></td>
                  <td style={{ ...s.td, textAlign: 'right', color: r.margin < 0 ? '#DC2626' : '#111827' }}>
                    <span style={s.numBold}>{formatKRW(r.margin)}</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: r.margin_rate < 0 ? '#DC2626' : '#374151' }}>
                    {(Math.round(r.margin_rate * 10) / 10).toFixed(1)}%
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <span style={s.num}>{(Math.round(r.margin_contribution * 10) / 10).toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  toolbar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  sortRow:   { display: 'flex', gap: 6 },
  sortBtn:   { padding: '6px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, textDecoration: 'none' },
  shareBox:  { display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 },
  shareLb:   { fontSize: 11, color: '#6b7280' },
  shareVal:  { fontSize: 16, fontWeight: 700, color: '#1D4ED8', fontVariantNumeric: 'tabular-nums' },
  empty:     { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 10 },
  tableWrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:        { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  row:       { borderBottom: '1px solid #f3f4f6' },
  td:        { padding: '10px 14px', verticalAlign: 'middle' },
  num:       { color: '#374151', fontVariantNumeric: 'tabular-nums' },
  numBold:   { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
}
