'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { updateListingPrice, updateListingStatus, type CommerceListingRow } from '@/actions/admin/commerce'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

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
                {['썸네일', '상품명', '브랜드', '배송', '정상가', '가격', '상태', '등록일', '액션'].map((h) => (
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
