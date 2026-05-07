import { formatKRW } from '@/lib/calc'
import type { OverviewResult } from '@/actions/analytics'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
        <div style={s.chartWrap}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={by_date} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                width={68}
                tickFormatter={(v) => formatKRW(Number(v))}
              />
              <Tooltip
                formatter={(value) => formatKRW(Number(value))}
                labelStyle={{ fontSize: 11, color: '#6b7280' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="매출"
                stroke="#2563EB"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cost"
                name="원가"
                stroke="#6B7280"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="margin"
                name="마진"
                stroke="#16A34A"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
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
  chartWrap: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 10px', background: '#fff' },
}
