'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { updateListingPrice, updateListingStatus, type CommerceListingRow } from '@/actions/admin/commerce'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

const BUY_PREVIEW_W = 280
const BUY_THUMB_H = 112
const BUY_PRIMARY = '#1f5d3a'

function productNameInitial(name: string | null | undefined): string {
  const t = name?.trim()
  if (!t) return '?'
  return t[0] ?? '?'
}

function badgePillStyle(label: string): { bg: string; color: string } {
  const known: Record<string, { bg: string; color: string }> = {
    오늘출발: { bg: '#ea580c', color: '#ffffff' },
    무료배송: { bg: '#1f5d3a', color: '#ffffff' },
    추천상품: { bg: '#1f5d3a', color: '#ffffff' },
    일시품절: { bg: '#888888', color: '#ffffff' },
    가격네고: { bg: '#2563eb', color: '#ffffff' },
    BEST: { bg: '#ea580c', color: '#ffffff' },
  }
  return known[label] ?? { bg: '#6b7280', color: '#ffffff' }
}

/** /buy 목록 카드와 동일 계열: 썸네일 좌상단 뱃지 1개 */
function buyCardCornerBadge(row: CommerceListingRow): string | null {
  const first = row.badge_labels?.[0]?.trim()
  if (first) return first
  const ship = shippingBadgeStyle(row.shipping_type)
  if (row.shipping_type === 'free' || row.shipping_type === 'conditional_free') return ship.label
  return null
}

function BuyListingPreviewCard({ row }: { row: CommerceListingRow }) {
  const title = row.products?.name?.trim() ?? '(상품명 없음)'
  const brand = row.brand_name?.trim() ?? ''
  const thumb = row.thumbnail_url?.trim()
  const corner = buyCardCornerBadge(row)
  const cornerStyle = corner ? badgePillStyle(corner) : null
  const savings =
    row.original_price != null && row.original_price > row.commerce_price
      ? row.original_price - row.commerce_price
      : null

  return (
    <div
      style={{
        width: BUY_PREVIEW_W,
        maxWidth: '92vw',
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        {cornerStyle ? (
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              zIndex: 1,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: cornerStyle.bg,
              color: cornerStyle.color,
              lineHeight: 1.25,
            }}
          >
            {corner}
          </span>
        ) : null}
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={BUY_PREVIEW_W}
            height={BUY_THUMB_H}
            style={{
              width: '100%',
              height: BUY_THUMB_H,
              objectFit: 'cover',
              display: 'block',
              background: '#f5f5f5',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: BUY_THUMB_H,
              background: '#eef4f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: BUY_PRIMARY,
              lineHeight: 1,
            }}
            aria-hidden
          >
            {productNameInitial(row.products?.name)}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {brand ? (
          <div style={{ fontSize: 11, color: BUY_PRIMARY, fontWeight: 600, lineHeight: 1.25 }}>{brand}</div>
        ) : null}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#111827',
            lineHeight: 1.35,
            minHeight: 36,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: '#888' }}>식식이가</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{formatKRW(row.commerce_price)}</span>
          {savings != null && savings > 0 ? (
            <span style={{ fontSize: 12, color: BUY_PRIMARY }}>{formatKRW(savings)} 절감</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, paddingBottom: 10 }}>
          <ShippingTypeBadge type={row.shipping_type} />
          <span className={statusBadgeClass(row.status, s)} style={{ fontSize: 11 }}>
            {row.status}
          </span>
        </div>
      </div>
    </div>
  )
}

type StatusFilter = 'all' | 'draft' | 'visible' | 'hidden' | 'sold_out' | 'discontinued'

export default function ListingsClient({
  listings,
  statusFilter,
}: {
  listings: CommerceListingRow[]
  statusFilter: StatusFilter
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [buyPreviewRow, setBuyPreviewRow] = useState<CommerceListingRow | null>(null)

  useEffect(() => {
    if (!buyPreviewRow) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuyPreviewRow(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [buyPreviewRow])

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  const run = useCallback(
    async (fn: () => Promise<{ success: boolean; error?: string }>) => {
      setError(null)
      startTransition(async () => {
        const r = await fn()
        if (!r.success) {
          setError(r.error ?? '처리 실패')
          return
        }
        refresh()
      })
    },
    [refresh],
  )

  function onChangePrice(listing: CommerceListingRow) {
    const raw = window.prompt(
      '새 판매가(원, 정수)',
      String(listing.commerce_price),
    )
    if (raw === null) return
    const price = parseInt(String(raw).replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) {
      setError('가격은 1원 이상의 정수여야 합니다')
      return
    }
    run(() => updateListingPrice(listing.id, price))
  }

  return (
    <>
      {buyPreviewRow ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setBuyPreviewRow(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="스토어 카드 미리보기"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'relative' }}
          >
            <button
              type="button"
              onClick={() => setBuyPreviewRow(null)}
              className={s.ghostBtn}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                fontSize: 12,
                zIndex: 2,
              }}
            >
              닫기
            </button>
            <BuyListingPreviewCard row={buyPreviewRow} />
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
              /buy 목록 카드와 동일한 정보 계열(미리보기)
            </p>
          </div>
        </div>
      ) : null}

      <div className={s.actionsRow} style={{ justifyContent: 'space-between', width: '100%' }}>
        <span className={s.inlineMuted}>
          필터: {statusFilter} · {listings.length}건
        </span>
        <Link href="/admin/commerce/products/new" className={s.primaryBtn}>
          + 상품 등록
        </Link>
      </div>

      {error ? (
        <div
          className={s.panel}
          style={{ borderColor: 'var(--ds-border-danger, #fecaca)', color: 'var(--ds-text-danger, #b91c1c)' }}
        >
          {error}
        </div>
      ) : null}

      {listings.length === 0 ? (
        <div className={s.empty}>등록된 상품이 없습니다. 상품을 추가해 주세요.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                {['썸네일', '상품명', '브랜드', '배송', '정상가', '가격', '상태', '등록일', '미리보기', '액션'].map((h) => (
                  <th key={h} className={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map((row) => (
                <tr key={row.id}>
                  <td className={s.tdNowrap}>
                    {row.thumbnail_url?.trim() ? (
                      <img
                        src={row.thumbnail_url.trim()}
                        alt=""
                        width={40}
                        height={40}
                        style={{ objectFit: 'cover', borderRadius: 8, display: 'block' }}
                      />
                    ) : (
                      <span className={s.cellMutedSm}>이미지 없음</span>
                    )}
                  </td>
                  <td className={s.tdWide}>
                    <div className={s.cellStrong}>{row.products?.name ?? '(상품 정보 없음)'}</div>
                  </td>
                  <td className={s.tdNowrap}>
                    {row.brand_name?.trim() ? (
                      <span className={s.cellMutedSm}>{row.brand_name.trim()}</span>
                    ) : (
                      <span className={s.cellMutedSm}>—</span>
                    )}
                  </td>
                  <td className={s.tdNowrap}>
                    <ShippingTypeBadge type={row.shipping_type} />
                  </td>
                  <td className={s.tdNowrap} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.original_price != null && row.original_price > 0 ? (
                      formatKRW(row.original_price)
                    ) : (
                      <span className={s.cellMutedSm}>—</span>
                    )}
                  </td>
                  <td className={s.tdNowrap} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatKRW(row.commerce_price)}
                  </td>
                  <td className={s.tdNowrap}>
                    <span className={statusBadgeClass(row.status, s)}>{row.status}</span>
                  </td>
                  <td className={s.tdNowrap}>{String(row.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td className={s.tdNowrap}>
                    <button
                      type="button"
                      className={s.ghostBtn}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => setBuyPreviewRow(row)}
                    >
                      미리보기
                    </button>
                  </td>
                  <td className={s.tdNowrap}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {row.status !== 'discontinued' ? (
                        <button
                          type="button"
                          className={s.ghostBtn}
                          disabled={pending}
                          onClick={() => onChangePrice(row)}
                        >
                          가격
                        </button>
                      ) : null}
                      {row.status === 'draft' ? (
                        <button
                          type="button"
                          className={s.primaryBtnSm}
                          disabled={pending}
                          onClick={() => run(() => updateListingStatus(row.id, 'visible'))}
                        >
                          공개
                        </button>
                      ) : null}
                      {row.status === 'visible' ? (
                        <>
                          <button
                            type="button"
                            className={s.ghostBtn}
                            disabled={pending}
                            onClick={() => run(() => updateListingStatus(row.id, 'hidden'))}
                          >
                            숨김
                          </button>
                          <button
                            type="button"
                            className={s.ghostBtn}
                            disabled={pending}
                            onClick={() => run(() => updateListingStatus(row.id, 'sold_out'))}
                          >
                            품절
                          </button>
                          <button
                            type="button"
                            className={s.ghostBtn}
                            disabled={pending}
                            onClick={() => run(() => updateListingStatus(row.id, 'discontinued'))}
                          >
                            판매중단
                          </button>
                        </>
                      ) : null}
                      {row.status === 'hidden' || row.status === 'sold_out' ? (
                        <button
                          type="button"
                          className={s.primaryBtnSm}
                          disabled={pending}
                          onClick={() => run(() => updateListingStatus(row.id, 'visible'))}
                        >
                          재공개
                        </button>
                      ) : null}
                    </div>
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

function statusBadgeClass(status: string, mod: typeof s): string {
  if (status === 'visible') return mod.badgeScoreOk
  if (status === 'draft') return mod.badgeScoreMid
  if (status === 'hidden') return mod.badgeScoreLow
  if (status === 'sold_out') return mod.badgeHigh
  if (status === 'discontinued') return mod.badgeCritical
  return mod.badgeNormal
}

function shippingBadgeStyle(type: string): { label: string; bg: string; color: string } {
  switch (type) {
    case 'paid':
      return { label: '유료배송', bg: '#f3f4f6', color: '#888888' }
    case 'conditional_free':
      return { label: '조건부 무료', bg: '#1f5d3a', color: '#ffffff' }
    case 'cold':
      return { label: '냉장(구)', bg: '#dbeafe', color: '#2563eb' }
    case 'same_day':
      return { label: '당일(구)', bg: '#ffedd5', color: '#ea580c' }
    case 'free':
    default:
      return { label: '무료배송', bg: '#1f5d3a', color: '#ffffff' }
  }
}

function ShippingTypeBadge({ type }: { type: string }) {
  const cfg = shippingBadgeStyle(type)
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}
