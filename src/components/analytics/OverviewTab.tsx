import { formatKRW } from '@/lib/calc'
import type { OverviewResult } from '@/actions/analytics'

function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const v = Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)
  return `${v > 0 ? '+' : ''}${v}%`
}

function deltaColor(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '#9ca3af'
  if (n > 0)  return '#15803D'
  if (n < 0)  return '#DC2626'
  return '#6b7280'
}

export default function OverviewTab({ data }: { data: OverviewResult }) {
  const { summary, by_date } = data
  const maxRev = Math.max(1, ...by_date.map((d) => Math.abs(d.revenue)))

  return (
    <>
      <div style={s.kpiGrid}>
        <KpiCard label="총 매출"   value={formatKRW(summary.revenue)}
                 deltaText={formatPct(summary.revenue_growth)} deltaColor={deltaColor(summary.revenue_growth)} />
        <KpiCard label="총 원가"   value={formatKRW(summary.cost)} />
        <KpiCard label="총 마진"   value={formatKRW(summary.margin)}
                 deltaText={formatPct(summary.margin_growth)} deltaColor={deltaColor(summary.margin_growth)} />
        <KpiCard label="마진율"
                 value={`${(Math.round(summary.margin_rate * 10) / 10).toFixed(1)}%`}
                 deltaText={summary.margin_rate_delta !== null ? `${summary.margin_rate_delta > 0 ? '+' : ''}${(Math.round(summary.margin_rate_delta * 10) / 10).toFixed(1)}p` : undefined}
                 deltaColor={deltaColor(summary.margin_rate_delta)} />
      </div>

      <div style={s.compareNote}>
        전기간 비교: 매출 {formatKRW(summary.prev_revenue)} → {formatKRW(summary.revenue)} · 마진 {formatKRW(summary.prev_margin)} → {formatKRW(summary.margin)}
      </div>

      <h2 style={s.h2}>일자별 매출 / 원가 / 마진</h2>
      {by_date.length === 0 ? (
        <div style={s.empty}>해당 기간 매출 데이터가 없습니다</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>날짜</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>원가</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
                <th style={s.th}>매출 분포</th>
              </tr>
            </thead>
            <tbody>
              {by_date.map((d) => {
                const rate = d.revenue !== 0 ? (d.margin / d.revenue) * 100 : 0
                const w = (Math.abs(d.revenue) / maxRev) * 100
                return (
                  <tr key={d.date} style={s.row}>
                    <td style={s.td}><span style={s.date}>{d.date}</span></td>
                    <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(d.revenue)}</span></td>
                    <td style={{ ...s.td, textAlign: 'right' }}><span style={s.num}>{formatKRW(d.cost)}</span></td>
                    <td style={{ ...s.td, textAlign: 'right', color: d.margin < 0 ? '#DC2626' : '#111827' }}>
                      <span style={s.numBold}>{formatKRW(d.margin)}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: rate < 0 ? '#DC2626' : '#374151' }}>
                      {(Math.round(rate * 10) / 10).toFixed(1)}%
                    </td>
                    <td style={s.td}>
                      <div style={s.barTrack}>
                        <div style={{ ...s.barFill, width: `${Math.max(2, w)}%`, background: d.revenue < 0 ? '#FCA5A5' : '#93C5FD' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function KpiCard({
  label, value, deltaText, deltaColor,
}: {
  label: string; value: string; deltaText?: string; deltaColor?: string
}) {
  return (
    <div style={s.card}>
      <span style={s.cardLabel}>{label}</span>
      <span style={s.cardVal}>{value}</span>
      {deltaText && (
        <span style={{ ...s.cardDelta, color: deltaColor ?? '#6b7280' }}>
          전기간 {deltaText}
        </span>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  kpiGrid:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 },
  card:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  cardLabel: { fontSize: 11, color: '#6b7280', fontWeight: 500 },
  cardVal:   { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  cardDelta: { fontSize: 11 },
  compareNote:{ fontSize: 12, color: '#6b7280', marginBottom: 24 },
  h2:        { fontSize: 14, fontWeight: 600, margin: '8px 0 8px' },
  empty:     { textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13, border: '1px dashed #e5e7eb', borderRadius: 10 },
  tableWrap: { border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:        { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  row:       { borderBottom: '1px solid #f3f4f6' },
  td:        { padding: '10px 14px', verticalAlign: 'middle' },
  date:      { color: '#6b7280', fontSize: 12 },
  num:       { color: '#374151', fontVariantNumeric: 'tabular-nums' },
  numBold:   { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  barTrack:  { width: '100%', height: 10, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 999 },
}
