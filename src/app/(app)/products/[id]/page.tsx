import Link from 'next/link'
import type { CSSProperties } from 'react'
import { getProductDetail } from '@/actions/product'
import { getProductAnalytics } from '@/actions/product-analytics'
import ProductRepurchaseListClient from '@/components/product/ProductRepurchaseListClient'
import { formatKRW } from '@/lib/calc'

export const metadata = { title: '상품 상세 — RealMyOS' }

const ellipsis: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function avgCycleKpiColor(days: number | null): string {
  if (days == null) return '#111827'
  if (days <= 20) return '#1f5d3a'
  if (days <= 30) return '#d97706'
  return '#dc2626'
}

/** 전월 대비 증감. 둘 다 있을 때만 표시. 짧아짐=초록, 길어짐=빨강 */
function repurchaseDeltaSub(
  current: number | null | undefined,
  prev: number | null | undefined,
): { text: string; color: string } | null {
  if (current == null || prev == null) return null
  const d = current - prev
  if (d === 0) return { text: '변동없음', color: '#9ca3af' }
  if (d < 0) return { text: `${d}일`, color: '#1f5d3a' }
  return { text: `+${d}일`, color: '#dc2626' }
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const id = params.id

  const detailRes = await getProductDetail(id)
  if (!detailRes.success || !detailRes.data) {
    console.error('[products/[id]] getProductDetail 실패', id, detailRes.error)
    return (
      <main style={{ minHeight: '100vh', background: '#f7f6f2', padding: '28px 24px 60px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
            <Link href="/products" style={{ color: '#9ca3af', textDecoration: 'none' }}>상품</Link>
            {' / '}상세
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#111827' }}>
            상품 정보를 불러오지 못했습니다
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            {detailRes.error ?? '알 수 없는 오류'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/products"
              style={{ padding: '10px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#111827', textDecoration: 'none' }}
            >
              목록으로
            </Link>
            <Link
              href={`/products/${id}/edit`}
              style={{ padding: '10px 16px', background: '#1f5d3a', border: '1px solid #1f5d3a', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}
            >
              수정 페이지
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // analytics는 별도 — 실패해도 헤더/기본 정보는 표시
  let analyticsData: Awaited<ReturnType<typeof getProductAnalytics>>['data'] = undefined
  try {
    const analyticsRes = await getProductAnalytics(id)
    if (analyticsRes.success) analyticsData = analyticsRes.data
    else console.error('analytics 실패:', analyticsRes.error)
  } catch (e) {
    console.error('analytics 실패:', e)
  }

  const p = detailRes.data
  const a = analyticsData
  const categoryLine = p.category_name || '미분류'
  const maxMonth = Math.max(1, ...(a?.monthly_sales.map((m) => m.amount) ?? [1]))

  return (
    <main style={{ minHeight: '100vh', background: '#f7f6f2', padding: '28px 24px 60px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 6, ...ellipsis }}>
              {categoryLine}
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', ...ellipsis }}>
              {p.name}
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
              매입가 {p.current_cost_price != null ? formatKRW(p.current_cost_price) : '-'}
              {' · '}
              판매가 {p.selling_price != null ? formatKRW(p.selling_price) : '-'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link
              href={`/products/${id}/edit`}
              style={{
                padding: '10px 16px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: '#111827',
                textDecoration: 'none',
              }}
            >
              수정
            </Link>
            <Link
              href={`/orders/new?product_id=${encodeURIComponent(id)}`}
              style={{
                padding: '10px 16px',
                background: '#1f5d3a',
                border: '1px solid #1f5d3a',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              + 주문 등록
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
          {[
            {
              label: '이번달 매출',
              value: formatKRW(a?.kpi.month_sales ?? 0),
              color: '#111827',
              sub: null as { text: string; color: string } | null,
            },
            {
              label: '평균 마진율',
              value: a?.kpi.avg_margin_rate != null ? `${a.kpi.avg_margin_rate}%` : '-',
              color: '#1f5d3a',
              sub: null,
            },
            {
              label: '구매 거래처',
              value: `${a?.kpi.buyer_count ?? 0}곳`,
              color: '#111827',
              sub: null,
            },
            {
              label: '평균 재구매 주기',
              value: a?.kpi.avg_repurchase_days != null ? `${a.kpi.avg_repurchase_days}일` : '-',
              color: avgCycleKpiColor(a?.kpi.avg_repurchase_days ?? null),
              sub: repurchaseDeltaSub(
                a?.kpi.avg_repurchase_days,
                a?.kpi.avg_repurchase_days_prev_month,
              ),
            },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '16px 18px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, letterSpacing: '-0.02em', ...ellipsis }}>
                {k.value}
              </div>
              {k.sub ? (
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: k.sub.color }}>
                  {k.sub.text}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* 월별 매출 */}
          <section style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>월별 매출 추이</div>
              <div style={cardMeta}>최근 6개월</div>
            </div>
            {(a?.monthly_sales?.length ?? 0) === 0 ? (
              <div style={empty}>매출 데이터가 없습니다</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 160, paddingTop: 8 }}>
                {a!.monthly_sales.map((m) => {
                  const h = Math.max(4, Math.round((m.amount / maxMonth) * 120))
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div
                        title={formatKRW(m.amount)}
                        style={{
                          width: '100%',
                          maxWidth: 36,
                          height: h,
                          borderRadius: 6,
                          background: m.is_current ? '#1f5d3a' : '#e5e7eb',
                        }}
                      />
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>{m.label}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 구매 거래처 */}
          <section style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>구매 거래처</div>
              <div style={cardMeta}>이번달 기준</div>
            </div>
            {(a?.buyers_this_month.length ?? 0) === 0 ? (
              <div style={empty}>이번달 구매 이력이 없습니다</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {a!.buyers_this_month.map((b, i) => (
                  <div key={b.customer_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 18, fontSize: 13, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <Link
                          href={`/customers/${b.customer_id}`}
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: '#111827',
                            textDecoration: 'underline',
                            textUnderlineOffset: 2,
                            ...ellipsis,
                            maxWidth: '60%',
                          }}
                        >
                          {b.name}
                        </Link>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', flexShrink: 0 }}>
                          {formatKRW(b.total_amount)}
                        </span>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: '#9ca3af', ...ellipsis }}>
                        {b.unit_price != null ? `${formatKRW(b.unit_price)} × ${b.total_qty}개` : `${b.total_qty}개`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 거래처별 단가 */}
          <section style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>거래처별 단가</div>
              <div style={cardMeta}>
                기준가 {a?.base_price != null ? formatKRW(a.base_price) : (p.selling_price != null ? formatKRW(p.selling_price) : '-')}
              </div>
            </div>
            {(a?.customer_prices.length ?? 0) === 0 ? (
              <div style={empty}>단가 이력이 없습니다</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {a!.customer_prices.map((row) => {
                  const base = a?.base_price ?? p.selling_price
                  const low = base != null && row.unit_price < base
                  return (
                    <div key={row.customer_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
                      <Link
                        href={`/customers/${row.customer_id}`}
                        style={{ fontSize: 14, fontWeight: 600, color: '#374151', textDecoration: 'none', ...ellipsis }}
                      >
                        {row.name}
                      </Link>
                      <span style={{ fontSize: 14, fontWeight: 800, color: low ? '#E8701C' : '#111827', flexShrink: 0 }}>
                        {formatKRW(row.unit_price)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 재구매 주기 */}
          <section style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>거래처별 재구매 주기</div>
              <div style={cardMeta}>최근 6개월 기준</div>
            </div>
            <ProductRepurchaseListClient rows={a?.repurchase ?? []} />
          </section>
        </div>
      </div>
    </main>
  )
}

const card: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '18px 18px 16px',
  minHeight: 220,
}

const cardHead: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
  marginBottom: 14,
}

const cardTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: '#111827',
}

const cardMeta: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#9ca3af',
}

const empty: CSSProperties = {
  fontSize: 13,
  color: '#9ca3af',
  paddingTop: 8,
}
