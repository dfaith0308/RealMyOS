import { formatKRW } from '@/lib/calc'
import type { RiskSignals } from '@/actions/analytics'

export default function RiskTab({ data }: { data: RiskSignals }) {
  const noSignals =
    data.declining_customers.length === 0 &&
    data.low_margin_customers.length === 0 &&
    data.loss_products.length === 0 &&
    data.high_revenue_low_margin.length === 0 &&
    data.high_refund_products.length === 0

  if (noSignals) {
    return (
      <div style={s.empty}>
        🟢 위험 신호 없음 — 해당 기간 모든 지표가 안전 범위 안에 있습니다.
      </div>
    )
  }

  return (
    <div style={s.grid}>
      <Section title="📉 매출 감소 거래처" hint="전기간 대비 -20% 이상 하락">
        {data.declining_customers.length === 0
          ? <Empty />
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>거래처</th>
                <th style={{ ...s.th, textAlign: 'right' }}>전기간</th>
                <th style={{ ...s.th, textAlign: 'right' }}>현재</th>
                <th style={{ ...s.th, textAlign: 'right' }}>변화율</th>
              </tr></thead>
              <tbody>
                {data.declining_customers.map((c) => (
                  <tr key={c.customer_key} style={s.row}>
                    <td style={s.td}>{c.customer_name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(c.prev_revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(c.revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {c.growth_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      <Section
        title="📊 마진 낮은 거래처"
        hint={`마진율 < ${data.margin_warning_threshold}% (settings.margin_warning_threshold)`}
      >
        {data.low_margin_customers.length === 0
          ? <Empty />
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>거래처</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
              </tr></thead>
              <tbody>
                {data.low_margin_customers.map((c) => (
                  <tr key={c.customer_key} style={s.row}>
                    <td style={s.td}>{c.customer_name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(c.revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {c.margin_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      <Section title="💸 손해 상품" hint="마진 &lt; 0 — 팔수록 손해">
        {data.loss_products.length === 0
          ? <Empty />
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>상품</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
              </tr></thead>
              <tbody>
                {data.loss_products.map((p) => (
                  <tr key={p.product_name} style={s.row}>
                    <td style={s.td}>{p.product_name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(p.revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {formatKRW(p.margin)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626' }}>
                      {p.margin_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      <Section
        title="🚨 매출 TOP인데 마진 하위 — 핵심 위험"
        hint="매출 상위 10개 거래처 ∩ 마진율 하위 50%"
      >
        {data.high_revenue_low_margin.length === 0
          ? <Empty />
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>순위</th>
                <th style={s.th}>거래처</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진</th>
                <th style={{ ...s.th, textAlign: 'right' }}>마진율</th>
              </tr></thead>
              <tbody>
                {data.high_revenue_low_margin.map((c) => (
                  <tr key={c.customer_key} style={s.row}>
                    <td style={s.td}>#{c.rank}</td>
                    <td style={s.td}>{c.customer_name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(c.revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: c.margin < 0 ? '#DC2626' : '#111827' }}>
                      {formatKRW(c.margin)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {c.margin_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>

      <Section title="↩️ 반품 많은 상품" hint="반품/매출 비율 ≥ 5%">
        {data.high_refund_products.length === 0
          ? <Empty />
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>상품</th>
                <th style={{ ...s.th, textAlign: 'right' }}>매출</th>
                <th style={{ ...s.th, textAlign: 'right' }}>반품</th>
                <th style={{ ...s.th, textAlign: 'right' }}>반품율</th>
              </tr></thead>
              <tbody>
                {data.high_refund_products.map((p) => (
                  <tr key={p.product_name} style={s.row}>
                    <td style={s.td}>{p.product_name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(p.sales_revenue)}</td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626' }}>
                      {formatKRW(p.refund_revenue)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>
                      {p.refund_ratio.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>
    </div>
  )
}

function Section({
  title, hint, children,
}: {
  title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <section style={s.section}>
      <div style={s.sectionHead}>
        <h3 style={s.sectionTitle}>{title}</h3>
        {hint && <span style={s.sectionHint}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Empty() {
  return <div style={s.sectionEmpty}>해당 신호 없음</div>
}

const s: Record<string, React.CSSProperties> = {
  grid:        { display: 'grid', gridTemplateColumns: '1fr', gap: 16 },
  section:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
  sectionHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  sectionTitle:{ fontSize: 13, fontWeight: 700, margin: 0 },
  sectionHint: { fontSize: 11, color: '#9ca3af' },
  sectionEmpty:{ padding: '20px 0', color: '#9ca3af', fontSize: 12, textAlign: 'center' },
  empty:       { textAlign: 'center', padding: '40px 0', color: '#15803D', fontSize: 14, border: '1px dashed #BBF7D0', background: '#F0FDF4', borderRadius: 10 },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:          { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  row:         { borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '8px 10px', verticalAlign: 'middle', color: '#374151', fontVariantNumeric: 'tabular-nums' },
}
