import { getDashboardData, getAiInsight, getTodayCollections } from '@/actions/dashboard'
import { formatKRW } from '@/lib/calc'
import Link from 'next/link'

export const metadata = { title: '대시보드 — RealMyOS' }

export default async function DashboardPage() {
  const [result, collectionsResult] = await Promise.all([
    getDashboardData(),
    getTodayCollections(),
  ])
  if (!result.success || !result.data) {
    return <main style={s.page}><p style={{ color: '#9ca3af' }}>데이터를 불러올 수 없습니다.</p></main>
  }
  const d           = result.data
  const collections = collectionsResult.data ?? []
  const aiMsg       = await getAiInsight(d.ai_context)

  return (
    <main style={s.page}>

      {/* AI 한마디 */}
      <div style={s.aiBox}>
        <span style={s.aiIcon}>💡</span>
        <span style={s.aiText}>{aiMsg}</span>
      </div>

      {/* 오늘 수금할 거래처 */}
      {collections.length > 0 && (
        <div style={ds.collectBox}>
          <div style={ds.collectHeader}>
            <span style={ds.collectTitle}>💸 오늘 수금할 거래처</span>
            <span style={ds.collectSub}>잔액 있음 · 3일 이상 수금 없음 · 상위 {collections.length}개</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {collections.map((c) => (
              <div key={c.id} style={ds.collectRow}>
                <div>
                  <span style={ds.collectName}>{c.name}</span>
                  <span style={ds.collectMeta}>
                    {c.last_payment_date
                      ? `마지막 수금 ${c.days_since_payment}일 전`
                      : '수금 이력 없음'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={ds.collectBal}>{formatKRW(c.current_balance)}</span>
                  <a href={`/payments/new?customer_id=${c.id}`} style={ds.payBtn}>수금하기</a>
                  <a href={`/customers/${c.id}/ledger`} style={ds.ledBtn}>원장</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI */}
      <div style={s.grid4}>
        <KpiCard label="총 미수금"    value={formatKRW(d.total_receivable)} color={d.total_receivable > 0 ? '#B91C1C' : undefined} />
        <KpiCard label="이번달 매출"  value={formatKRW(d.monthly_sales)} />
        <KpiCard label="총 연체금"    value={formatKRW(d.total_overdue)} color={d.total_overdue > 0 ? '#B91C1C' : undefined} />
        <KpiCard label="총 예치금"    value={formatKRW(d.total_deposit)} color={d.total_deposit > 0 ? '#1D4ED8' : undefined} />
      </div>

      <div style={s.grid2}>
        {/* 위험 거래처 TOP5 */}
        <Section title="🔴 수금 우선순위 TOP 5" href="/customers">
          {d.top_customers.length === 0
            ? <Empty text="연체 거래처 없음" />
            : d.top_customers.map((c, i) => (
              <div key={c.id} style={s.listRow}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', width: 16 }}>#{i + 1}</span>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    {c.primary_reason && (
                      <span style={{ fontSize: 11, color: '#B45309', marginLeft: 6 }}>{c.primary_reason}</span>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                  background: c.score >= 300 ? '#FEE2E2' : c.score >= 100 ? '#FEF3C7' : '#F3F4F6',
                  color: c.score >= 300 ? '#B91C1C' : c.score >= 100 ? '#92400E' : '#6b7280',
                }}>{c.score}점</span>
              </div>
            ))}
        </Section>

        {/* 오늘 할 일 */}
        <Section title="✅ 오늘 할 일">
          <TodoRow icon="💸" label="연체 거래처" count={d.overdue_count} href="/customers" color="#B91C1C" />
          <TodoRow icon="📵" label="14일 이상 미연락" count={d.uncontacted_count} href="/customers" color="#B45309" />
          {d.draft_order_count > 0 && (
            <TodoRow icon="📋" label="미처리 주문(draft)" count={d.draft_order_count} href="/orders" color="#6b7280" />
          )}
        </Section>

        {/* 거래처 매출 TOP5 */}
        <Section title="📊 거래처 매출 TOP 5 (이번달)" href="/customers">
          {d.top_customer_sales.length === 0
            ? <Empty text="이번달 주문 없음" />
            : d.top_customer_sales.map((c, i) => (
              <div key={i} style={s.listRow}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', width: 16 }}>#{i + 1}</span>
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {formatKRW(c.amount)}
                </span>
              </div>
            ))}
        </Section>

        {/* 상품 매출 TOP5 */}
        <Section title="📦 상품 매출 TOP 5 (이번달)" href="/products">
          {d.top_product_sales.length === 0
            ? <Empty text="이번달 주문 없음" />
            : d.top_product_sales.map((p, i) => (
              <div key={i} style={s.listRow}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', width: 16 }}>#{i + 1}</span>
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {formatKRW(p.amount)}
                </span>
              </div>
            ))}
        </Section>

        {/* 자금 흐름 */}
        <Section title="💰 오늘 자금 계획" href="/funds">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={s.fundKpi}>
              <span style={s.fundLabel}>계획</span>
              <span style={s.fundVal}>{formatKRW(d.fund_total_planned)}</span>
            </div>
            <div style={s.fundKpi}>
              <span style={s.fundLabel}>이행</span>
              <span style={{ ...s.fundVal, color: '#15803D' }}>{formatKRW(d.fund_total_actual)}</span>
            </div>
            <div style={s.fundKpi}>
              <span style={s.fundLabel}>미이행</span>
              <span style={{ ...s.fundVal, color: d.fund_pending_count > 0 ? '#B91C1C' : '#6b7280' }}>
                {d.fund_pending_count}건
              </span>
            </div>
          </div>
        </Section>
      </div>
    </main>
  )
}

// ── 서브 컴포넌트 ────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={s.kpiCard}>
      <span style={s.kpiLabel}>{label}</span>
      <span style={{ ...s.kpiVal, color: color ?? '#111827' }}>{value}</span>
    </div>
  )
}

function Section({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHead}>
        <span style={s.sectionTitle}>{title}</span>
        {href && <Link href={href} style={s.seeAll}>전체 →</Link>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function TodoRow({ icon, label, count, href, color }: { icon: string; label: string; count: number; href: string; color: string }) {
  return (
    <Link href={href} style={{ ...s.listRow, textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
        background: count > 0 ? '#FEF2F2' : '#F3F4F6',
        color: count > 0 ? color : '#9ca3af',
      }}>{count}건</span>
    </Link>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{text}</p>
}

// ── 스타일 ───────────────────────────────────────────────────

const ds: Record<string, React.CSSProperties> = {
  collectBox:    { background: '#fff', border: '2px solid #FCA5A5', borderRadius: 12, padding: '16px 20px' },
  collectHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  collectTitle:  { fontSize: 14, fontWeight: 700, color: '#B91C1C' },
  collectSub:    { fontSize: 11, color: '#9ca3af' },
  collectRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' },
  collectName:   { fontSize: 14, fontWeight: 600, color: '#111827', marginRight: 8 },
  collectMeta:   { fontSize: 11, color: '#9ca3af' },
  collectBal:    { fontSize: 14, fontWeight: 700, color: '#B91C1C', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' as const },
  payBtn:        { padding: '6px 12px', background: '#B91C1C', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' },
  ledBtn:        { padding: '6px 10px', background: '#f3f4f6', color: '#374151', borderRadius: 6, fontSize: 12, textDecoration: 'none' },
}

const s: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 },
  aiBox:       { background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' },
  aiIcon:      { fontSize: 18, flexShrink: 0 },
  aiText:      { fontSize: 14, fontWeight: 500, color: '#15803D', lineHeight: 1.5 },
  grid4:       { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  grid2:       { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  kpiCard:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  kpiLabel:    { fontSize: 11, color: '#9ca3af', fontWeight: 500 },
  kpiVal:      { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  section:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:{ fontSize: 13, fontWeight: 600, color: '#111827' },
  seeAll:      { fontSize: 11, color: '#6b7280', textDecoration: 'none' },
  listRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f9fafb' },
  fundKpi:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '10px', background: '#f9fafb', borderRadius: 8 },
  fundLabel:   { fontSize: 11, color: '#9ca3af' },
  fundVal:     { fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
}