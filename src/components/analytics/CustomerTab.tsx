import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import type { CustomerAnalyticsResult } from '@/actions/analytics'
import CostCoverageNotice from './CostCoverageNotice'

const SORTS: { id: 'sales' | 'margin' | 'growth'; label: string }[] = [
  { id: 'sales',  label: '매출순' },
  { id: 'margin', label: '마진순' },
  { id: 'growth', label: '성장률순' },
]

export default function CustomerTab({
  data, sort, from, to,
}: {
  data: CustomerAnalyticsResult; sort: string; from: string; to: string
}) {
  const rows = [...data.rows].sort((a, b) => {
    if (sort === 'margin') return b.margin - a.margin
    if (sort === 'growth') {
      const av = a.growth_rate ?? Number.NEGATIVE_INFINITY
      const bv = b.growth_rate ?? Number.NEGATIVE_INFINITY
      return bv - av
    }
    return b.revenue - a.revenue
  })

  const { kpi } = data

  return (
    <>
      <CostCoverageNotice coverage={data.cost_coverage} />
      <div style={s.kpiGrid}>
        <KpiCard
          label="상위 3개 거래처 비중"
          value={`${(Math.round(data.top3_share * 10) / 10).toFixed(1)}%`}
          hint="높을수록 의존도 위험"
        />
        <KpiCard
          label="평균 결제기간"
          value={kpi.avg_collection_days !== null ? `${kpi.avg_collection_days}일` : '—'}
          hint="수금 배분(FIFO) 기준"
        />
        <KpiCard
          label="미수금 비율"
          value={kpi.receivable_ratio !== null ? `${(Math.round(kpi.receivable_ratio * 10) / 10).toFixed(1)}%` : '—'}
          hint="(매출 - 수금) / 매출"
        />
        <KpiCard
          label="반복 구매율"
          value={kpi.repeat_purchase_rate !== null ? `${(Math.round(kpi.repeat_purchase_rate * 10) / 10).toFixed(1)}%` : '—'}
          hint="기간 내 2회 이상 주문 거래처 비율"
        />
      </div>

      <div style={s.toolbar}>
        <div style={s.sortRow}>
          {SORTS.map((opt) => {
            const sp = new URLSearchParams({ tab: 'customer', from, to, sort: opt.id })
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
      </div>

      {rows.length === 0 ? (
        <div style={s.empty}>해당 기간 매출 데이터가 없습니다</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>거래처명</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>원가</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
                <th style={{ ...s.th, textAlign: 'right' }}>비중</th>
                <th style={{ ...s.th, textAlign: 'right' }}>순위</th>
                <th style={{ ...s.th, textAlign: 'right' }}>성장률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customer_key} style={s.row}>
                  <td style={s.td}>{r.customer_name}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(r.revenue)}</span></td>
                  <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(r.cost)}</span></td>
                  <td style={{ ...s.td, textAlign: 'right', color: r.margin < 0 ? '#DC2626' : '#111827' }}>
                    <span style={s.numBold}>{formatKRW(r.margin)}</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', color: r.margin_rate < 0 ? '#DC2626' : '#374151' }}>
                    {(Math.round(r.margin_rate * 10) / 10).toFixed(1)}%
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {(Math.round(r.share * 10) / 10).toFixed(1)}%
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{r.rank}</td>
                  <td style={{
                    ...s.td, textAlign: 'right',
                    color: r.growth_rate === null ? '#9ca3af'
                          : r.growth_rate < 0 ? '#DC2626'
                          : r.growth_rate > 0 ? '#15803D' : '#374151',
                  }}>
                    {r.growth_rate === null
                      ? '신규'
                      : `${r.growth_rate > 0 ? '+' : ''}${(Math.round(r.growth_rate * 10) / 10).toFixed(1)}%`}
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

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={s.card}>
      <span style={s.cardLabel}>{label}</span>
      <span style={s.cardVal}>{value}</span>
      {hint && <span style={s.cardHint}>{hint}</span>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  kpiGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  card:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  cardLabel: { fontSize: 11, color: '#6b7280', fontWeight: 500 },
  cardVal:   { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  cardHint:  { fontSize: 10, color: '#9ca3af' },
  toolbar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sortRow:   { display: 'flex', gap: 6 },
  sortBtn:   { padding: '6px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, textDecoration: 'none' },
  empty:     { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 10 },
  tableWrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:        { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  row:       { borderBottom: '1px solid #f3f4f6' },
  td:        { padding: '10px 14px', verticalAlign: 'middle' },
  num:       { color: '#374151', fontVariantNumeric: 'tabular-nums' },
  numBold:   { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
}
