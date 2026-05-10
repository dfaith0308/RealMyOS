'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  createListingFull,
  getAdminCategories,
  uploadListingImage,
  type AdminCategoryNode,
  type AdminCategoryRow,
  type ListingShippingType,
} from '@/actions/admin/commerce'
import { formatKRW } from '@/lib/calc'
import mod from './listing-new-client.module.css'

function flattenAdminCategoryTree(nodes: AdminCategoryNode[]): AdminCategoryRow[] {
  const out: AdminCategoryRow[] = []
  function walk(n: AdminCategoryNode) {
    const { children, ...row } = n
    out.push(row)
    for (const c of children) walk(c)
  }
  for (const n of nodes) walk(n)
  return out
}

function sortCategoryRows(rows: AdminCategoryRow[]): AdminCategoryRow[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ko'))
}

function shippingBadgeStyle(type: string): { label: string; bg: string; color: string } {
  switch (type) {
    case 'paid':
      return { label: '유료배송', bg: '#f3f4f6', color: '#888888' }
    case 'cold':
      return { label: '냉장배송', bg: '#dbeafe', color: '#2563eb' }
    case 'same_day':
      return { label: '오늘출고', bg: '#ffedd5', color: '#ea580c' }
    case 'free':
    default:
      return { label: '무료배송', bg: '#1f5d3a', color: '#ffffff' }
  }
}

const THUMB_H = 160

function productNameInitial(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t[0] ?? '?'
}

function PhBar({ width = '100%' }: { width?: string }) {
  return <div className={mod.phBar} style={{ width }} aria-hidden />
}

export default function ListingNewClient() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [categoryFlat, setCategoryFlat] = useState<AdminCategoryRow[]>([])
  const [rootCategoryId, setRootCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')

  const [brandName, setBrandName] = useState('')
  const [productName, setProductName] = useState('')
  const [spec, setSpec] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)

  const [commercePrice, setCommercePrice] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [shippingType, setShippingType] = useState<ListingShippingType>('free')
  const [listingDescription, setListingDescription] = useState('')
  const [adminMemo, setAdminMemo] = useState('')
  const [visibility, setVisibility] = useState<'draft' | 'visible'>('draft')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    let cancelled = false
    getAdminCategories().then((res) => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error ?? '카테고리 조회 실패')
        setCategoryFlat([])
        return
      }
      setCategoryFlat(flattenAdminCategoryTree(res.data?.tree ?? []))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSubCategoryId('')
  }, [rootCategoryId])

  const rootOptions = useMemo(
    () => sortCategoryRows(categoryFlat.filter((r) => r.parent_id == null && r.is_active)),
    [categoryFlat],
  )

  const subCategoryOptions = useMemo(() => {
    if (!rootCategoryId) return []
    return sortCategoryRows(
      categoryFlat.filter((r) => r.parent_id === rootCategoryId && r.is_active),
    )
  }, [categoryFlat, rootCategoryId])

  const effectiveCategoryId = subCategoryId || rootCategoryId

  const previewPrice = (() => {
    const n = parseInt(commercePrice.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const previewOriginal = (() => {
    const n = parseInt(originalPrice.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const savingsAmount =
    previewPrice != null && previewOriginal != null && previewOriginal > previewPrice
      ? previewOriginal - previewPrice
      : null

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)
    setUploadBusy(true)
    const fd = new FormData()
    fd.set('file', file)
    try {
      const res = await uploadListingImage(fd)
      if (!res.success) {
        setUploadError(res.error ?? '업로드 실패')
        return
      }
      setThumbnailUrl(res.data?.url ?? '')
    } catch {
      setUploadError('업로드 실패')
    } finally {
      setUploadBusy(false)
    }
  }

  function parseOriginal(): number | null {
    const raw = originalPrice.replace(/[^\d]/g, '')
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  function submitWithStatus(status: 'draft' | 'visible', andReset: boolean) {
    setError(null)
    const pn = productName.trim()
    if (!pn) {
      setError('상품명을 입력해 주세요')
      return
    }
    if (!rootCategoryId) {
      setError('대분류 카테고리를 선택해 주세요')
      return
    }
    if (!effectiveCategoryId) {
      setError('카테고리를 선택해 주세요')
      return
    }
    const price = parseInt(commercePrice.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) {
      setError('식식이 판매가는 1원 이상 정수로 입력해 주세요')
      return
    }

    const op = parseOriginal()

    startTransition(async () => {
      const r = await createListingFull({
        brand_name: brandName.trim() || null,
        product_name: pn,
        spec: spec.trim() || null,
        thumbnail_url: thumbnailUrl.trim() || null,
        category_id: effectiveCategoryId,
        commerce_price: price,
        original_price: op,
        shipping_type: shippingType,
        admin_memo: adminMemo.trim() || null,
        description: listingDescription.trim() || null,
        status,
      })
      if (!r.success) {
        setError(r.error ?? '저장 실패')
        return
      }
      if (andReset) {
        setBrandName('')
        setProductName('')
        setSpec('')
        setThumbnailUrl('')
        setRootCategoryId('')
        setSubCategoryId('')
        setCommercePrice('')
        setOriginalPrice('')
        setShippingType('free')
        setListingDescription('')
        setAdminMemo('')
        setVisibility('draft')
        setUploadError(null)
        showToast('상품이 저장되었습니다')
        router.refresh()
        return
      }
      showToast('상품이 저장되었습니다')
      router.refresh()
    })
  }

  const shipCfg = shippingBadgeStyle(shippingType)
  const thumb = thumbnailUrl.trim()
  const descPreview = listingDescription.trim()

  return (
    <>
      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            padding: '10px 18px',
            borderRadius: 8,
            background: '#15803d',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {toast}
        </div>
      ) : null}

      <div className={mod.shell}>
        <div className={mod.layout}>
          <div className={mod.formColumn}>
            {error ? <div className={mod.errorCard}>{error}</div> : null}

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>카테고리</h2>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>대분류 · 필수</div>
                  <select
                    className={mod.select}
                    value={rootCategoryId}
                    onChange={(e) => setRootCategoryId(e.target.value)}
                  >
                    <option value="">선택</option>
                    {rootOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className={mod.label}>소분류</div>
                  <select
                    className={mod.select}
                    value={subCategoryId}
                    disabled={!rootCategoryId}
                    onChange={(e) => setSubCategoryId(e.target.value)}
                  >
                    <option value="">선택 안 함 (대분류만)</option>
                    {subCategoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {rootCategoryId && subCategoryOptions.length === 0 ? (
                    <p className={mod.hint}>등록된 소분류 없음 — 대분류만 적용</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>기본 정보</h2>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>브랜드명</div>
                  <input
                    className={mod.input}
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="예: 해표, 청정원, 오뚜기"
                  />
                </div>
                <div>
                  <div className={mod.label}>상품명 · 필수</div>
                  <input
                    className={mod.input}
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="예: 업소용 식용유, 진간장, 냉동 삼겹살"
                  />
                </div>
                <div>
                  <div className={mod.label}>규격·용량</div>
                  <input
                    className={mod.input}
                    value={spec}
                    onChange={(e) => setSpec(e.target.value)}
                    placeholder="예: 18L, 5kg × 2개, 1kg 낱개"
                  />
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>이미지</h2>
              <div className={mod.fieldStack}>
                <label className={`${mod.uploadZone} ${uploadBusy || pending ? mod.uploadZoneDisabled : ''}`}>
                  이미지를 클릭해서 업로드
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadBusy || pending}
                    onChange={onPickFile}
                    style={{ display: 'none' }}
                  />
                </label>
                {uploadBusy ? <p className={mod.hint}>업로드 중…</p> : null}
                {uploadError ? <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>{uploadError}</p> : null}
                {thumb ? (
                  <img src={thumb} alt="" className={mod.uploadPreview} width={140} height={140} />
                ) : null}
                <div>
                  <div className={mod.label}>또는 이미지 URL 직접 입력</div>
                  <input
                    className={mod.input}
                    value={thumbnailUrl}
                    onChange={(e) => setThumbnailUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>가격</h2>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>식식이 판매가 (원) · 필수</div>
                  <input
                    className={mod.input}
                    inputMode="numeric"
                    value={commercePrice}
                    onChange={(e) => setCommercePrice(e.target.value)}
                    placeholder="예: 45000"
                  />
                </div>
                <div>
                  <div className={mod.label}>시중 정상가 (원)</div>
                  <input
                    className={mod.input}
                    inputMode="numeric"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="예: 52000 (판매가보다 클 때만 절감액 표시)"
                  />
                </div>
                {savingsAmount != null && savingsAmount > 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#1f5d3a' }}>절감액: {formatKRW(savingsAmount)}</p>
                ) : null}
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>배송</h2>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>배송 유형 · 필수</div>
                  <select
                    className={mod.select}
                    value={shippingType}
                    onChange={(e) => setShippingType(e.target.value as ListingShippingType)}
                  >
                    <option value="free">무료배송</option>
                    <option value="paid">유료배송</option>
                    <option value="cold">냉장배송</option>
                    <option value="same_day">오늘출고</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>상세 설명</h2>
              <p className={mod.hint}>구매 화면에 노출되는 설명입니다.</p>
              <div className={mod.fieldStack}>
                <div>
                  <textarea
                    className={`${mod.textarea} ${mod.textareaNoResize}`}
                    value={listingDescription}
                    onChange={(e) => setListingDescription(e.target.value)}
                    placeholder="원산지, 보관법, 배송 안내, 구성 등"
                    rows={6}
                  />
                </div>
                <div>
                  <div className={mod.label}>운영 메모 (내부용, 선택)</div>
                  <textarea
                    className={`${mod.textarea} ${mod.textareaNoResize}`}
                    value={adminMemo}
                    onChange={(e) => setAdminMemo(e.target.value)}
                    placeholder="구매자에게 보이지 않습니다"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className={mod.card}>
              {/* TODO: private / hidden / sold_out 상태 구조는
                  다음 단계에서 별도 작업 예정 */}
              <h2 className={mod.sectionTitle}>공개 설정</h2>
              <div className={mod.fieldStack}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2b2b2b' }}>
                  <input type="radio" name="vis" checked={visibility === 'draft'} onChange={() => setVisibility('draft')} />
                  초안 기본
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2b2b2b' }}>
                  <input type="radio" name="vis" checked={visibility === 'visible'} onChange={() => setVisibility('visible')} />
                  즉시 공개 선호
                </label>
                <p className={mod.hint}>하단 버튼이 실제 저장 방식을 결정합니다.</p>
              </div>
            </div>
          </div>

          <div className={mod.previewColumn}>
            <div className={mod.previewSticky}>
              <div className={mod.previewCard}>
                <div style={{ position: 'relative', width: '100%' }}>
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
                      background: shipCfg.bg,
                      color: shipCfg.color,
                      lineHeight: 1.25,
                    }}
                  >
                    {shipCfg.label}
                  </span>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      width={280}
                      height={THUMB_H}
                      style={{
                        width: '100%',
                        height: THUMB_H,
                        objectFit: 'cover',
                        display: 'block',
                        background: '#f5f5f5',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: THUMB_H,
                        background: '#eef4f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 28,
                        color: '#1f5d3a',
                        fontWeight: 700,
                      }}
                      aria-hidden
                    >
                      {productNameInitial(productName)}
                    </div>
                  )}
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {brandName.trim() ? (
                    <div style={{ fontSize: 11, color: '#1f5d3a', fontWeight: 600 }}>{brandName.trim()}</div>
                  ) : (
                    <PhBar width="40%" />
                  )}
                  {productName.trim() ? (
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: '#111' }}>
                      {productName.trim()}
                    </div>
                  ) : (
                    <PhBar width="90%" />
                  )}
                  {spec.trim() ? (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{spec.trim()}</div>
                  ) : (
                    <PhBar width="55%" />
                  )}
                  {previewPrice != null ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>식식이가</span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>{formatKRW(previewPrice)}</span>
                      {savingsAmount != null && savingsAmount > 0 ? (
                        <span style={{ fontSize: 12, color: '#1f5d3a', fontWeight: 600 }}>
                          {formatKRW(savingsAmount)} 절감
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>식식이가</span>
                      <PhBar width="70%" />
                    </div>
                  )}
                  <div className={mod.previewDescBlock}>
                    <p className={mod.previewDescTitle}>상세 설명 미리보기</p>
                    {descPreview ? (
                      <p className={mod.previewDescBody}>{listingDescription}</p>
                    ) : (
                      <PhBar width="100%" />
                    )}
                  </div>
                </div>
              </div>
              <p className={mod.previewFoot}>실제 구매 화면에서 이렇게 보입니다</p>
            </div>
          </div>
        </div>

        <div className={mod.ctaBar}>
          <div className={mod.ctaInner}>
            <Link href="/admin/commerce/products" className={`${mod.btn} ${mod.btnCancel}`}>
              취소
            </Link>
            <button
              type="button"
              className={`${mod.btn} ${mod.btnDraft}`}
              disabled={pending}
              onClick={() => submitWithStatus('draft', false)}
            >
              임시저장
            </button>
            <button
              type="button"
              className={`${mod.btn} ${mod.btnNext}`}
              disabled={pending}
              onClick={() => submitWithStatus('visible', true)}
            >
              저장 후 다음 상품
            </button>
            <button
              type="button"
              className={`${mod.btn} ${mod.btnPrimary}`}
              disabled={pending}
              onClick={() => submitWithStatus('visible', false)}
            >
              저장 후 공개
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
