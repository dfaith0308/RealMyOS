'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  createListing,
  getProducts,
  updateListingPrice,
  updateListingStatus,
  type CommerceListingRow,
  type ProductPickRow,
} from '@/actions/admin/commerce'
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
  const [modalOpen, setModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pickList, setPickList] = useState<ProductPickRow[]>([])
  const [pickLoading, setPickLoading] = useState(false)
  const [selected, setSelected] = useState<ProductPickRow | null>(null)
  const [newPrice, setNewPrice] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [listingDescription, setListingDescription] = useState('')

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

  useEffect(() => {
    if (!modalOpen) return
    let cancelled = false
    setPickLoading(true)
    const t = setTimeout(() => {
      getProducts(search.trim() || undefined)
        .then((res) => {
          if (cancelled) return
          setPickLoading(false)
          if (!res.success) {
            setError(res.error ?? '목록 조회 실패')
            setPickList([])
            return
          }
          setPickList(res.data?.products ?? [])
        })
        .catch(() => {
          if (cancelled) return
          setPickLoading(false)
          setError('목록 조회 실패')
          setPickList([])
        })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
      setPickLoading(false)
    }
  }, [modalOpen, search])

  function openModal() {
    setError(null)
    setSearch('')
    setSelected(null)
    setNewPrice('')
    setThumbnailUrl('')
    setListingDescription('')
    setPickList([])
    setPickLoading(true)
    setModalOpen(true)
  }

  async function submitCreate() {
    if (!selected) {
      setError('상품을 선택해 주세요')
      return
    }
    if (selected.already_listed) {
      setError('이미 플랫폼에 등록된 상품입니다')
      return
    }
    const price = parseInt(newPrice.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) {
      setError('판매 가격은 1원 이상 정수로 입력해 주세요')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await createListing({
        product_id: selected.id,
        commerce_price: price,
        thumbnail_url: thumbnailUrl.trim() || null,
        description: listingDescription.trim() || null,
      })
      if (!r.success) {
        setError(r.error ?? '등록 실패')
        return
      }
      setModalOpen(false)
      refresh()
    })
  }

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
        <button type="button" className={s.primaryBtn} onClick={openModal} disabled={pending}>
          + 상품 등록
        </button>
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
                {['썸네일', '상품명', '가격', '상태', '등록일', '액션'].map((h) => (
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

      {modalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
          role="dialog"
          aria-modal
        >
          <div
            className={s.panel}
            style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
          >
            <div className={s.panelHeader}>
              <h2 className={s.panelTitle}>상품 등록</h2>
              <button type="button" className={s.ghostBtn} onClick={() => setModalOpen(false)}>
                닫기
              </button>
            </div>
            <p className={s.cellMutedSm} style={{ marginBottom: 12 }}>
              상품명으로 검색합니다. 이미 플랫폼에 등록된 항목은 선택할 수 없습니다. 미등록 상품만 선택 후 판매가를 입력하세요.
            </p>
            <input
              className={s.input}
              placeholder="상품명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <div style={{ minHeight: 160, marginBottom: 12 }}>
              {pickLoading ? (
                <div className={s.empty}>불러오는 중…</div>
              ) : pickList.length === 0 ? (
                <div className={s.empty}>검색 결과가 없습니다. 다른 검색어를 입력해 보세요.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pickList.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={p.already_listed}
                        onClick={() => {
                          if (p.already_listed) return
                          setSelected(p)
                          setNewPrice(p.selling_price && p.selling_price > 0 ? String(p.selling_price) : '')
                        }}
                        className={s.ghostBtn}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          opacity: p.already_listed ? 0.55 : 1,
                          cursor: p.already_listed ? 'not-allowed' : 'pointer',
                          border:
                            selected?.id === p.id
                              ? '2px solid var(--color-primary, #0f766e)'
                              : '1px solid var(--ds-border-default, #e5e7eb)',
                        }}
                      >
                        <span className={s.cellStrong}>{p.name ?? p.id}</span>
                        {p.selling_price != null && p.selling_price > 0 ? (
                          <span className={s.cellMutedSm}> · 참고가 {formatKRW(p.selling_price)}</span>
                        ) : null}
                        {p.already_listed ? (
                          <span className={s.cellMutedSm}> · 이미 등록됨</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 6 }}>
              커머스 판매가 (원)
            </label>
            <input
              className={s.input}
              inputMode="numeric"
              placeholder="예: 12000"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 6 }}>
              썸네일 URL
            </label>
            <input
              className={s.input}
              type="url"
              placeholder="이미지 URL 입력 (예: https://...)"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            />
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 6 }}>
              상품 설명
            </label>
            <textarea
              className={s.input}
              placeholder="상품 설명을 입력하세요"
              value={listingDescription}
              onChange={(e) => setListingDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
            />
            <div className={s.actionsRow}>
              <button type="button" className={s.primaryBtn} disabled={pending} onClick={submitCreate}>
                등록
              </button>
              <button type="button" className={s.ghostBtn} onClick={() => setModalOpen(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
