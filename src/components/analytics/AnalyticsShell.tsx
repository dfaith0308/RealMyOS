'use client'

import Link from 'next/link'

type Tab  = 'overview' | 'margin' | 'customer' | 'risk'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '매출현황' },
  { id: 'margin',   label: '마진분석' },
  { id: 'customer', label: '거래처분석' },
  { id: 'risk',     label: '위험신호' },
]

const PRESETS: { id: string; label: string }[] = [
  { id: 'this_month', label: '이번달' },
  { id: 'last_month', label: '지난달' },
  { id: '3m',         label: '최근3개월' },
  { id: '1y',         label: '최근1년' },
]

export default function AnalyticsShell({
  tab, from, to, preset, sort, children,
}: {
  tab:     Tab
  from:    string
  to:      string
  preset?: string
  sort:    string
  children: React.ReactNode
}) {
  function buildHref(opts: { tab?: Tab; from?: string; to?: string; preset?: string; sort?: string }) {
    const sp = new URLSearchParams()
    sp.set('tab', opts.tab ?? tab)
    if (opts.preset) {
      sp.set('preset', opts.preset)
    } else {
      sp.set('from', opts.from ?? from)
      sp.set('to',   opts.to   ?? to)
    }
    return `/analytics?${sp.toString()}`
  }

  return (
    <>
      <div style={s.header}>
        <h1 style={s.title}>매출분석</h1>
        <span style={s.subtitle}>어디서 돈을 버는지 / 어디서 돈이 새는지</span>
      </div>

      <div style={s.tabRow}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={buildHref({ tab: t.id, preset })}
            style={{
              ...s.tab,
              background: tab === t.id ? '#111827' : '#fff',
              color:      tab === t.id ? '#fff'    : '#374151',
              borderColor:tab === t.id ? '#111827' : '#d1d5db',
              fontWeight: tab === t.id ? 600       : 400,
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div style={s.filterRow}>
        <div style={s.presetRow}>
          {PRESETS.map((p) => (
            <Link
              key={p.id}
              href={buildHref({ preset: p.id })}
              style={{
                ...s.presetBtn,
                background: preset === p.id ? '#EFF6FF' : '#fff',
                borderColor:preset === p.id ? '#1D4ED8' : '#e5e7eb',
                color:      preset === p.id ? '#1D4ED8' : '#6b7280',
                fontWeight: preset === p.id ? 600       : 400,
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <form method="get" style={s.dateForm}>
          <input type="hidden" name="tab"  value={tab} />
          <input type="hidden" name="sort" value={sort} />
          <label style={s.lb}>기간</label>
          <input type="date" name="from" defaultValue={from} style={s.input} />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
          <input type="date" name="to"   defaultValue={to}   style={s.input} />
          <button type="submit" style={s.searchBtn}>적용</button>
        </form>
      </div>

      <div style={s.rangeNote}>
        조회 기간: <strong>{from}</strong> ~ <strong>{to}</strong>
        <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 11 }}>
          · 매출 기준: <code>order.status = confirmed</code>, 분석 SSOT: <code>order_lines</code>
        </span>
      </div>

      {children}
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  header:    { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle:  { fontSize: 12, color: '#6b7280' },
  tabRow:    { display: 'flex', gap: 8, marginBottom: 12 },
  tab:       { padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, textDecoration: 'none' },
  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 },
  presetRow: { display: 'flex', gap: 6 },
  presetBtn: { padding: '6px 12px', borderRadius: 999, border: '1px solid', fontSize: 12, textDecoration: 'none' },
  dateForm:  { display: 'flex', gap: 6, alignItems: 'center' },
  lb:        { fontSize: 12, color: '#6b7280' },
  input:     { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  searchBtn: { padding: '6px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  rangeNote: { fontSize: 12, color: '#6b7280', margin: '4px 0 16px 0' },
}
