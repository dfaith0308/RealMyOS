'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { updateListingPrice, updateListingStatus, type CommerceListingRow } from '@/actions/admin/commerce'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

/**
 * 식당OS(resturant_os) storefront 베이스 URL — 슬래시 없이. dev 예: http://localhost:3001
 * 실제 /buy·/buy/products/[id] 라우트를 iframe으로 그대로 불러옵니다(컴포넌트 복제 없음).
 */
function getStorefrontOrigin(): string {
  return (process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ?? '').trim().replace(/\/$/, '')
}

function storefrontUrl(path: string): string {
  const o = getStorefrontOrigin()
  if (!o) return ''
  const p = path.startsWith('/') ? path : `/${path}`
  return `${o}${p}`
}

/** resturant_os `getListing` / 목록 쿼리는 노출 중(visible + is_visible) 상품만 반환 */
function listingOnPublicStorefront(row: CommerceListingRow): boolean {
  return row.status === 'visible' && row.is_visible
}

type StorefrontPreviewTab = 'detail' | 'list'

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
  const [storefrontTab, setStorefrontTab] = useState<StorefrontPreviewTab>('detail')

  useEffect(() => {
    if (buyPreviewRow) setStorefrontTab('detail')
  }, [buyPreviewRow])

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
            aria-label="식당OS 스토어 실제 화면 미리보기"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(480px, 94vw)',
              height: '85vh',
              maxHeight: 920,
              background: '#f7f6f2',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                padding: '10px 12px',
                borderBottom: '1px solid #e7e5dc',
                background: '#f7f6f2',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1c1917' }}>스토어 미리보기</span>
                <button type="button" className={s.ghostBtn} style={{ fontSize: 12 }} onClick={() => setBuyPreviewRow(null)}>
                  닫기
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 11, color: '#78716c', marginRight: 4 }}>모바일 스토어</span>
                <button
                  type="button"
                  className={storefrontTab === 'detail' ? s.primaryBtnSm : s.ghostBtn}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setStorefrontTab('detail')}
                >
                  상품 상세
                </button>
                <button
                  type="button"
                  className={storefrontTab === 'list' ? s.primaryBtnSm : s.ghostBtn}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setStorefrontTab('list')}
                >
                  목록 /buy
                </button>
                {getStorefrontOrigin() ? (
                  <a
                    href={
                      storefrontTab === 'detail'
                        ? storefrontUrl(`/buy/products/${buyPreviewRow.id}`)
                        : storefrontUrl('/buy')
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.ghostBtn}
                    style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', display: 'inline-block' }}
                  >
                    새 탭에서 열기
                  </a>
                ) : null}
              </div>
              {!listingOnPublicStorefront(buyPreviewRow) ? (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.45 }}>
                  관리 상태 <strong>{buyPreviewRow.status}</strong> · 노출 {buyPreviewRow.is_visible ? 'ON' : 'OFF'}. 식당OS
                  스토어는 <strong>status=visible</strong> 이고 <strong>노출 ON</strong>인 상품만 페이지를 제공합니다. iframe에 404가
                  뜨는 것이 구매자 화면과 동일한 동작입니다.
                </p>
              ) : (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#57534e', lineHeight: 1.45 }}>
                  iframe = 식당OS 앱의 실제 라우트입니다. 하단 내비·장바구니 담기 등은 스토어 앱과 동일하게 동작합니다(별도 도메인/세션).
                </p>
              )}
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                justifyContent: 'center',
                background: '#f7f6f2',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 390,
                  height: '100%',
                  minHeight: 0,
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {!getStorefrontOrigin() ? (
                  <div style={{ padding: 16, fontSize: 13, color: '#444', lineHeight: 1.5 }}>
                    <strong>NEXT_PUBLIC_STOREFRONT_ORIGIN</strong> 이 필요합니다. 예:{' '}
                    <code style={{ fontSize: 12 }}>.env.local</code> 에{' '}
                    <code style={{ fontSize: 12 }}>NEXT_PUBLIC_STOREFRONT_ORIGIN=http://localhost:3001</code> 을 넣고 관리자 앱을
                    재시작하세요. 식당OS(<code>resturant_os</code>)를 해당 URL에서 실행 중이어야 합니다.
                  </div>
                ) : (
                  <iframe
                    key={`${storefrontTab}-${buyPreviewRow.id}`}
                    title="식당OS 스토어"
                    src={
                      storefrontTab === 'detail'
                        ? storefrontUrl(`/buy/products/${buyPreviewRow.id}`)
                        : storefrontUrl('/buy')
                    }
                    style={{ flex: 1, width: '100%', border: 'none', minHeight: 0, background: '#fff' }}
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}
              </div>
            </div>
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
                {['썸네일', '상품명', '브랜드', '배송', '정상가', '가격', '상태', '등록일', '스토어 미리보기', '액션'].map((h) => (
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
                      스토어 미리보기
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
