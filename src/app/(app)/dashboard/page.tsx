import { getDashboardData, getTodayCollections } from '@/actions/dashboard'
import { Suspense } from 'react'
import { formatKRW } from '@/lib/calc'
import Link from 'next/link'
import { fallbackMessage } from '@/lib/dashboard-utils'

export const metadata = { title: '대시보드 — RealMyOS' }

export default async function DashboardPage() {
  const [result, collectionsResult] = await Promise.all([
    getDashboardData(),
    getTodayCollections(),
  ])
  if (!result.success || !result.data) {
    return <main style={s.page}><p style={{ color: 'var(--color-text-secondary)' }}>데이터를 불러올 수 없습니다.</p></main>
  }
  const d           = result.data
  const collections = collectionsResult.data ?? []

  return (
    <main style={s.page}>

      {/* 블록1 — 지금 해야 할 행동 (PRODUCT §6-1) */}
      <Link href="/customers" style={{ textDecoration: 'none' }}>
        <div style={ds.actionBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={ds.actionTitle}>⚡ 지금 해야 할 행동</div>
              <div style={ds.actionMsg}>
                {d.total_receivable > 0
                  ? fallbackMessage(d.ai_context)
                  : '오늘 처리할 수금이 없습니다'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={ds.actionKpiLabel}>미수금 총액</div>
              <div style={ds.actionKpiVal}>{formatKRW(d.total_receivable)}</div>
              <div style={ds.actionCta}>거래처로 이동 →</div>
            </div>
          </div>
        </div>
      </Link>

      {/* AI 한마디 — Suspense로 분리 (페이지 블로킹 없음) */}
      <Suspense fallback={
        <div style={{ ...s.aiBox, opacity: 0.5 }}>
          <span style={s.aiIcon}>💡</span>
          <span style={{ ...s.aiText, color: 'var(--color-text-secondary)' }}>AI 분석 중...</span>
        </div>
      }>
        <AiInsightBox context={d.ai_context} />
      </Suspense>

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
        <KpiCard label="총 미수금"    value={formatKRW(d.total_receivable)} href="/customers" color={d.total_receivable > 0 ? 'var(--color-danger)' : undefined} />
        <KpiCard label="이번달 매출"  value={formatKRW(d.monthly_sales)} href="/customers" />
        <KpiCard label="총 연체금"    value={formatKRW(d.total_overdue)} href="/customers" color={d.total_overdue > 0 ? 'var(--color-danger)' : undefined} />
        <KpiCard label="총 예치금"    value={formatKRW(d.total_deposit)} href="/customers" color={d.total_deposit > 0 ? 'var(--color-primary)' : undefined} />
      </div>

      <div style={s.grid2}>
        {/* 위험 거래처 TOP5 */}
        <Section title="🔴 수금 우선순위 TOP 5" href="/customers">
          {d.top_customers.length === 0
            ? <Empty text="연체 거래처 없음" />
            : d.top_customers.map((c, i) => (
              <div key={c.id} style={s.listRow}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--color-primary)' : 'var(--color-text)', minWidth: 36 }}>{i + 1}순위</span>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    {c.primary_reason && (
                      <span style={{ fontSize: 11, color: 'var(--color-warning)', marginLeft: 6 }}>{c.primary_reason}</span>
                    )}
                    {(() => {
                      const delayDays = c.days_since_order - (c.payment_terms_days ?? 30)
                      if (delayDays <= 0) return null
                      return (
                        <span style={{ fontSize: 11, color: 'var(--color-danger)', marginLeft: 6, fontWeight: 700 }}>
                          D+{delayDays}
                        </span>
                      )
                    })()}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                  background: c.score >= 300 ? 'color-mix(in srgb, var(--color-danger) 18%, white)'
                           : c.score >= 100 ? 'color-mix(in srgb, var(--color-warning) 20%, white)'
                           : 'color-mix(in srgb, var(--color-border) 40%, white)',
                  color: c.score >= 300 ? 'var(--color-danger)'
                       : c.score >= 100 ? 'var(--color-warning)'
                       : 'var(--color-text-secondary)',
                }}>{c.score}점</span>
              </div>
            ))}
        </Section>

        {/* 오늘 할 일 */}
        <Section title="✅ 오늘 할 일">
          <TodoRow icon="💸" label="연체 거래처" count={d.overdue_count} href="/customers" color="var(--color-danger)" />
          <TodoRow icon="📵" label="14일 이상 미연락" count={d.uncontacted_count} href="/customers" color="var(--color-warning)" />
          {d.rfq_unanswered_count > 0 && (
            <TodoRow icon="📬" label="RFQ 미응답(24h 초과)" count={d.rfq_unanswered_count} href="/rfq" color="var(--color-text)" />
          )}
          {d.draft_order_count > 0 && (
            <TodoRow icon="📋" label="미처리 주문(draft)" count={d.draft_order_count} href="/orders" color="var(--color-text-secondary)" />
          )}
        </Section>

        {/* 거래처 매출 TOP5 */}
        <Section title="📊 거래처 매출 TOP 5 (이번달)" href="/customers">
          {d.top_customer_sales.length === 0
            ? <Empty text="이번달 주문 없음" />
            : d.top_customer_sales.map((c, i) => (
              <div key={i} style={s.listRow}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', minWidth: 28 }}>{i + 1}위</span>
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatKRW(c.amount)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.quantity.toLocaleString()}개
                  </div>
                </div>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', minWidth: 28 }}>{i + 1}위</span>
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
              <span style={{ ...s.fundVal, color: 'var(--color-success)' }}>{formatKRW(d.fund_total_actual)}</span>
            </div>
            <div style={s.fundKpi}>
              <span style={s.fundLabel}>미이행</span>
              <span style={{ ...s.fundVal, color: d.fund_pending_count > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                {d.fund_pending_count}건
              </span>
            </div>
          </div>

          {d.fund_items.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {d.fund_items.map((it, i) => {
                const isDone = it.status === 'completed'
                const badge = isDone
                  ? { text: '완료', bg: '#ECFDF5', fg: '#059669' }
                  : it.status === 'partial'
                    ? { text: '부분', bg: '#FEF3C7', fg: '#92400E' }
                    : it.status === 'overdue'
                      ? { text: '지연', bg: '#FEE2E2', fg: '#B91C1C' }
                      : { text: '대기', bg: '#F3F4F6', fg: '#6b7280' }

                return (
                  <div key={`${it.rule_name}-${i}`} style={s.listRow}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                        background: badge.bg, color: badge.fg, flexShrink: 0,
                      }}>
                        {badge.text}
                      </span>
                      <span style={{
                        fontSize: 13, color: '#374151',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {it.rule_name}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatKRW(it.planned_amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </main>
  )
}

// ── 서브 컴포넌트 ────────────────────────────────────────────

function KpiCard({ label, value, href, color }: { label: string; value: string; href?: string; color?: string }) {
  const content = (
    <div style={{ ...s.kpiCard, cursor: href ? 'pointer' : undefined }}>
      <span style={s.kpiLabel}>{label}</span>
      <span style={{ ...s.kpiVal, color: color ?? 'var(--color-text)' }}>{value}</span>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    )
  }

  return content
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
        <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{label}</span>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
        background: count > 0 ? 'color-mix(in srgb, var(--color-danger) 12%, white)' : 'color-mix(in srgb, var(--color-border) 40%, white)',
        color: count > 0 ? color : 'var(--color-text-secondary)',
      }}>{count}건</span>
    </Link>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{text}</p>
}

// ── 스타일 ───────────────────────────────────────────────────

import { getAiInsight } from '@/actions/dashboard'

async function AiInsightBox({ context }: { context: Parameters<typeof getAiInsight>[0] }) {
  const msg = await getAiInsight(context)
  return (
    <div style={{ background: 'color-mix(in srgb, var(--color-success) 10%, white)', border: `1px solid var(--color-border)`, borderRadius: 10,
      padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.5 }}>{msg}</span>
    </div>
  )
}

const ds: Record<string, React.CSSProperties> = {
  actionBox:     { background: 'var(--color-bg-card)', border: `1px solid var(--color-border)`, borderRadius: 12, padding: '16px 20px' },
  actionTitle:   { fontSize: 14, fontWeight: 800, color: 'var(--color-text)', marginBottom: 6 },
  actionMsg:     { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.5 },
  actionKpiLabel:{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 },
  actionKpiVal:  { fontSize: 16, fontWeight: 900, color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums' },
  actionCta:     { fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, fontWeight: 700 },
  collectBox:    { background: 'var(--color-bg-card)', border: `1px solid var(--color-border)`, borderRadius: 12, padding: '16px 20px' },
  collectHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  collectTitle:  { fontSize: 14, fontWeight: 800, color: 'var(--color-text)' },
  collectSub:    { fontSize: 11, color: 'var(--color-text-secondary)' },
  collectRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid var(--color-border)` },
  collectName:   { fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginRight: 8 },
  collectMeta:   { fontSize: 11, color: 'var(--color-text-secondary)' },
  collectBal:    { fontSize: 14, fontWeight: 800, color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' as const },
  payBtn:        { padding: '6px 12px', background: 'var(--color-primary)', color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 800, textDecoration: 'none' },
  ledBtn:        { padding: '6px 10px', background: 'rgba(43,43,43,0.06)', color: 'var(--color-text)', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none', border: `1px solid var(--color-border)` },
}

const s: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 },
  aiBox:       { background: 'var(--color-bg-card)', border: `1px solid var(--color-border)`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' },
  aiIcon:      { fontSize: 18, flexShrink: 0 },
  aiText:      { fontSize: 14, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.5 },
  grid4:       { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  grid2:       { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  kpiCard:     { background: 'var(--color-bg-card)', border: `1px solid var(--color-border)`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  kpiLabel:    { fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 700 },
  kpiVal:      { fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  section:     { background: 'var(--color-bg-card)', border: `1px solid var(--color-border)`, borderRadius: 10, padding: '16px' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' },
  seeAll:      { fontSize: 11, color: 'var(--color-text-secondary)', textDecoration: 'none' },
  listRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid color-mix(in srgb, var(--color-border) 55%, white)` },
  fundKpi:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: '10px', background: 'color-mix(in srgb, var(--color-border) 30%, white)', borderRadius: 10, border: `1px solid var(--color-border)` },
  fundLabel:   { fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 700 },
  fundVal:     { fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
}
