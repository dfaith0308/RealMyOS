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
import { calcMarginRate, formatDigitsForInput, formatKRW } from '@/lib/calc'
import mod from './listing-new-client.module.css'

const MAX_DETAIL_IMAGES = 5
const MAX_THUMB_BADGES = 2
const THUMB_H = 160

/** 하드코딩 썸네일 뱃지 (향후 뱃지 관리 화면에서 확장) */
// TODO: 향후 뱃지 관리 화면에서 추가/수정/삭제 가능하게 확장 예정
const THUMBNAIL_BADGE_OPTIONS: { label: string; bg: string; color: string }[] = [
  { label: '오늘출발', bg: '#ea580c', color: '#ffffff' },
  { label: '무료배송', bg: '#1f5d3a', color: '#ffffff' },
  { label: '추천상품', bg: '#1f5d3a', color: '#ffffff' },
  { label: '일시품절', bg: '#888888', color: '#ffffff' },
  { label: '가격네고', bg: '#2563eb', color: '#ffffff' },
  { label: 'BEST', bg: '#ea580c', color: '#ffffff' },
]

function thumbBadgeStyle(label: string): { bg: string; color: string } {
  const o = THUMBNAIL_BADGE_OPTIONS.find((x) => x.label === label)
  return o ? { bg: o.bg, color: o.color } : { bg: '#6b7280', color: '#ffffff' }
}

function toggleThumbBadge(current: string[], label: string): string[] {
  if (current.includes(label)) return current.filter((x) => x !== label)
  if (current.length >= MAX_THUMB_BADGES) return current
  return [...current, label]
}

/** 향후 "상품 복제" 등에서 초기 상태를 재사용할 수 있도록 묶음 */
export type ListingStudioFormState = {
  rootCategoryId: string
  subCategoryId: string
  brandName: string
  productName: string
  spec: string
  supplyPrice: string
  commercePrice: string
  originalPrice: string
  marginMode: 'price' | 'margin'
  marginInput: string
  shippingType: ListingShippingType
  shippingBoxQty: string
  shippingBoxFee: string
  conditionalFreeThreshold: string
  shippingGroup: string
  thumbnailBadges: string[]
  thumbnailUrl: string
  detailImageUrls: string[]
  listingDescription: string
  adminMemo: string
  visibility: 'draft' | 'visible'
}

export function createEmptyListingStudioForm(): ListingStudioFormState {
  return {
    rootCategoryId: '',
    subCategoryId: '',
    brandName: '',
    productName: '',
    spec: '',
    supplyPrice: '',
    commercePrice: '',
    originalPrice: '',
    marginMode: 'price',
    marginInput: '',
    shippingType: 'free',
    shippingBoxQty: '',
    shippingBoxFee: '',
    conditionalFreeThreshold: '',
    shippingGroup: '',
    thumbnailBadges: [],
    thumbnailUrl: '',
    detailImageUrls: [],
    listingDescription: '',
    adminMemo: '',
    visibility: 'draft',
  }
}

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

type PreviewBadge = { label: string; bg: string; color: string }

/** 배송 정책 전용 뱃지 (썸네일 커스텀 뱃지와 분리) */
function buildShippingPolicyBadges(
  shippingType: ListingShippingType,
  boxFeeStr: string,
  condThresholdStr: string,
): PreviewBadge[] {
  switch (shippingType) {
    case 'paid': {
      const fee = parseInt(boxFeeStr.replace(/\D/g, ''), 10)
      const ok = Number.isFinite(fee) && fee > 0
      return [
        {
          label: ok ? `배송비 ${formatKRW(fee)}/박스` : '배송비 /박스',
          bg: '#888888',
          color: '#ffffff',
        },
      ]
    }
    case 'conditional_free': {
      const thr = parseInt(condThresholdStr.replace(/\D/g, ''), 10)
      const ok = Number.isFinite(thr) && thr > 0
      return [{ label: ok ? `${formatKRW(thr)} 이상 무료` : '조건부 무료', bg: '#1f5d3a', color: '#ffffff' }]
    }
    case 'free':
    default:
      return [{ label: '무료배송', bg: '#1f5d3a', color: '#ffffff' }]
  }
}

function buildBoxShippingTierPreview(boxQtyStr: string, boxFeeStr: string): string {
  const q = parseInt(boxQtyStr.replace(/\D/g, ''), 10)
  const fee = parseInt(boxFeeStr.replace(/\D/g, ''), 10)
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(fee) || fee <= 0) return ''
  const parts: string[] = []
  parts.push(`${q}개까지 ${formatKRW(fee)}`)
  for (let b = 2; b <= 3; b++) {
    const lo = (b - 1) * q + 1
    const hi = b * q
    parts.push(`${lo}~${hi}개 ${formatKRW(b * fee)}`)
  }
  return parts.join(' / ')
}

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

  const empty = useMemo(() => createEmptyListingStudioForm(), [])

  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [categoryFlat, setCategoryFlat] = useState<AdminCategoryRow[]>([])
  const [rootCategoryId, setRootCategoryId] = useState(empty.rootCategoryId)
  const [subCategoryId, setSubCategoryId] = useState(empty.subCategoryId)

  const [brandName, setBrandName] = useState(empty.brandName)
  const [productName, setProductName] = useState(empty.productName)
  const [spec, setSpec] = useState(empty.spec)

  const [supplyPrice, setSupplyPrice] = useState(empty.supplyPrice)
  const [commercePrice, setCommercePrice] = useState(empty.commercePrice)
  const [originalPrice, setOriginalPrice] = useState(empty.originalPrice)
  const [marginMode, setMarginMode] = useState<'price' | 'margin'>(empty.marginMode)
  const [marginInput, setMarginInput] = useState(empty.marginInput)

  const [shippingType, setShippingType] = useState<ListingShippingType>(empty.shippingType)
  const [shippingBoxQty, setShippingBoxQty] = useState(empty.shippingBoxQty)
  const [shippingBoxFee, setShippingBoxFee] = useState(empty.shippingBoxFee)
  const [conditionalFreeThreshold, setConditionalFreeThreshold] = useState(empty.conditionalFreeThreshold)
  const [shippingGroup, setShippingGroup] = useState(empty.shippingGroup)

  const [thumbnailBadges, setThumbnailBadges] = useState<string[]>(empty.thumbnailBadges)

  const [thumbnailUrl, setThumbnailUrl] = useState(empty.thumbnailUrl)
  const [detailImageUrls, setDetailImageUrls] = useState<string[]>(empty.detailImageUrls)
  const [listingDescription, setListingDescription] = useState(empty.listingDescription)
  const [adminMemo, setAdminMemo] = useState(empty.adminMemo)
  const [visibility, setVisibility] = useState<'draft' | 'visible'>(empty.visibility)

  const [uploadBusy, setUploadBusy] = useState(false)
  const [previewTab, setPreviewTab] = useState<'card' | 'detail'>('card')

  const cost = parseInt(supplyPrice.replace(/\D/g, ''), 10) || 0

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

  const selectedRoot = useMemo(
    () => rootOptions.find((r) => r.id === rootCategoryId),
    [rootOptions, rootCategoryId],
  )

  const subCategoryOptions = useMemo(() => {
    if (!rootCategoryId) return []
    return sortCategoryRows(
      categoryFlat.filter((r) => r.parent_id === rootCategoryId && r.is_active),
    )
  }, [categoryFlat, rootCategoryId])

  const effectiveCategoryId = subCategoryId || rootCategoryId

  const previewPrice = (() => {
    const n = parseInt(commercePrice.replace(/\D/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const previewOriginal = (() => {
    const n = parseInt(originalPrice.replace(/\D/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const savingsAmount =
    previewPrice != null && previewOriginal != null && previewOriginal > previewPrice
      ? previewOriginal - previewPrice
      : null

  const marginRateDisplay = (() => {
    if (previewPrice == null || cost <= 0) return null
    const rate = calcMarginRate(previewPrice, cost)
    if (!isFinite(rate) || isNaN(rate)) return null
    return rate
  })()

  function handleMarginInput(v: string) {
    setMarginInput(v)
    const m = Number(v) / 100
    if (cost > 0 && m > 0 && m < 1) {
      setCommercePrice(String(Math.round(cost / (1 - m))))
    }
  }

  const shippingPolicyBadges = useMemo(
    () => buildShippingPolicyBadges(shippingType, shippingBoxFee, conditionalFreeThreshold),
    [shippingType, shippingBoxFee, conditionalFreeThreshold],
  )

  const boxTierPreview = useMemo(
    () => buildBoxShippingTierPreview(shippingBoxQty, shippingBoxFee),
    [shippingBoxQty, shippingBoxFee],
  )

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
    const raw = originalPrice.replace(/\D/g, '')
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  function addDetailImageSlot() {
    setDetailImageUrls((prev) => (prev.length >= MAX_DETAIL_IMAGES ? prev : [...prev, '']))
  }

  function removeDetailImageSlot(index: number) {
    setDetailImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  function setDetailImageUrl(index: number, url: string) {
    setDetailImageUrls((prev) => prev.map((u, i) => (i === index ? url : u)))
  }

  function applyResetForm() {
    const base = createEmptyListingStudioForm()
    setRootCategoryId(base.rootCategoryId)
    setSubCategoryId(base.subCategoryId)
    setBrandName(base.brandName)
    setProductName(base.productName)
    setSpec(base.spec)
    setSupplyPrice(base.supplyPrice)
    setCommercePrice(base.commercePrice)
    setOriginalPrice(base.originalPrice)
    setMarginMode(base.marginMode)
    setMarginInput(base.marginInput)
    setShippingType(base.shippingType)
    setShippingBoxQty(base.shippingBoxQty)
    setShippingBoxFee(base.shippingBoxFee)
    setConditionalFreeThreshold(base.conditionalFreeThreshold)
    setShippingGroup(base.shippingGroup)
    setThumbnailBadges(base.thumbnailBadges)
    setThumbnailUrl(base.thumbnailUrl)
    setDetailImageUrls(base.detailImageUrls)
    setListingDescription(base.listingDescription)
    setAdminMemo(base.adminMemo)
    setVisibility(base.visibility)
    setUploadError(null)
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
    const price = parseInt(commercePrice.replace(/\D/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) {
      setError('식식이 판매가는 1원 이상 정수로 입력해 주세요')
      return
    }

    const op = parseOriginal()
    const image_urls = detailImageUrls.map((u) => u.trim()).filter(Boolean)
    const badge_labels = thumbnailBadges.length > 0 ? thumbnailBadges : null

    startTransition(async () => {
      const r = await createListingFull({
        brand_name: brandName.trim() || null,
        product_name: pn,
        spec: spec.trim() || null,
        thumbnail_url: thumbnailUrl.trim() || null,
        image_urls: image_urls.length > 0 ? image_urls : null,
        badge_labels,
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
        applyResetForm()
        showToast('상품이 저장되었습니다')
        router.refresh()
        return
      }
      showToast('상품이 저장되었습니다')
      router.refresh()
    })
  }

  const thumb = thumbnailUrl.trim()
  const descPreview = listingDescription.trim()
  const detailUrlsForPreview = detailImageUrls.map((u) => u.trim()).filter(Boolean)
  const marginModeDisabled = cost <= 0

  function renderImageOverlays() {
    return (
      <div className={mod.badgeStack}>
        {thumbnailBadges.length > 0 ? (
          <div className={mod.badgeRow}>
            {thumbnailBadges.map((lbl) => {
              const st = thumbBadgeStyle(lbl)
              return (
                <span key={lbl} className={mod.badgePill} style={{ background: st.bg, color: st.color }}>
                  {lbl}
                </span>
              )
            })}
          </div>
        ) : null}
        <div className={mod.badgeRow}>
          {shippingPolicyBadges.map((b, i) => (
            <span key={`${b.label}-${i}`} className={mod.badgePill} style={{ background: b.bg, color: b.color }}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

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
              <div className={mod.sectionHeaderRow}>
                <h2 className={mod.sectionTitle}>카테고리</h2>
                <Link href="/admin/commerce/categories" className={mod.linkMuted}>
                  카테고리 관리
                </Link>
              </div>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>대분류 · 필수</div>
                  <div className={mod.categorySelectRow}>
                    {selectedRoot?.icon_url?.trim() ? (
                      <img src={selectedRoot.icon_url.trim()} alt="" className={mod.catOptionIcon} />
                    ) : (
                      <span className={mod.catIconSpacer} aria-hidden />
                    )}
                    <select
                      className={`${mod.select} ${mod.selectGrow}`}
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
                  <p className={mod.hint}>아이콘이 있는 대분류는 선택 시 왼쪽에 표시됩니다.</p>
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
              <h2 className={mod.sectionTitle}>가격 · 마진 계산</h2>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>공급가 (원)</div>
                  <input
                    className={mod.input}
                    inputMode="numeric"
                    type="text"
                    value={formatDigitsForInput(supplyPrice)}
                    onChange={(e) => setSupplyPrice(e.target.value.replace(/\D/g, ''))}
                    placeholder="예: 18,000"
                  />
                  <p className={mod.hint}>내부 운영용. 구매자에게 노출 안 됨</p>
                </div>
                <div>
                  <div className={mod.modeBtnRow}>
                    <button
                      type="button"
                      className={`${mod.modeBtn} ${marginMode === 'price' ? mod.modeBtnActive : ''}`}
                      onClick={() => setMarginMode('price')}
                    >
                      판매가 직접 입력
                    </button>
                    <button
                      type="button"
                      className={`${mod.modeBtn} ${marginMode === 'margin' ? mod.modeBtnActive : ''}`}
                      onClick={() => setMarginMode('margin')}
                      disabled={marginModeDisabled}
                    >
                      마진율로 판매가 계산
                    </button>
                  </div>
                  {marginMode === 'price' ? (
                    <div>
                      <div className={mod.label}>식식이 판매가 (원) · 필수</div>
                      <input
                        className={mod.input}
                        inputMode="numeric"
                        type="text"
                        value={formatDigitsForInput(commercePrice)}
                        onChange={(e) => setCommercePrice(e.target.value.replace(/\D/g, ''))}
                        placeholder="예: 22,900"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className={mod.label}>마진율 (%)</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          className={mod.input}
                          style={{ flex: 1, minWidth: 120 }}
                          type="number"
                          value={marginInput}
                          onChange={(e) => handleMarginInput(e.target.value)}
                          placeholder="마진율 %"
                          min={0}
                          max={99}
                        />
                        {commercePrice ? (
                          <span style={{ fontSize: 13, color: '#6b7280' }}>
                            → {formatKRW(Number(commercePrice.replace(/\D/g, '') || 0))}
                          </span>
                        ) : null}
                      </div>
                      <p className={mod.hint}>공급가를 먼저 입력한 뒤 사용할 수 있습니다.</p>
                    </div>
                  )}
                </div>
                <div>
                  <div className={mod.label}>시중 정상가 (원)</div>
                  <input
                    className={mod.input}
                    inputMode="numeric"
                    type="text"
                    value={formatDigitsForInput(originalPrice)}
                    onChange={(e) => setOriginalPrice(e.target.value.replace(/\D/g, ''))}
                    placeholder="예: 26,000"
                  />
                  <p className={mod.hint}>판매가보다 클 때만 절감액 표시</p>
                </div>
                {marginRateDisplay != null ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#1f5d3a' }}>
                    마진율: {marginRateDisplay.toFixed(1)}%
                  </p>
                ) : null}
                {savingsAmount != null && savingsAmount > 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#1f5d3a' }}>절감액: {formatKRW(savingsAmount)}</p>
                ) : null}
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>배송 정책</h2>
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
                    <option value="conditional_free">조건부 무료배송</option>
                  </select>
                </div>

                {shippingType === 'paid' ? (
                  <>
                    <div>
                      <div className={mod.label}>1박스 기준 수량</div>
                      <input
                        className={mod.input}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={shippingBoxQty}
                        onChange={(e) => setShippingBoxQty(e.target.value.replace(/\D/g, ''))}
                        placeholder="예: 10 (10개까지 1박스)"
                      />
                    </div>
                    <div>
                      <div className={mod.label}>박스당 배송비 (원)</div>
                      <input
                        className={mod.input}
                        type="text"
                        inputMode="numeric"
                        value={formatDigitsForInput(shippingBoxFee)}
                        onChange={(e) => setShippingBoxFee(e.target.value.replace(/\D/g, ''))}
                        placeholder="예: 3,000"
                      />
                      {/* TODO: 향후 shipping_fee, shipping_box_qty 컬럼 추가 후 DB 연결 예정 */}
                      {boxTierPreview ? (
                        <p className={mod.hint} style={{ color: '#1f5d3a' }}>
                          {boxTierPreview}
                        </p>
                      ) : (
                        <p className={mod.hint}>박스 수 = ⌈주문수량 ÷ 기준수량⌉ — 미리보기용 계산입니다.</p>
                      )}
                    </div>
                  </>
                ) : null}

                {shippingType === 'conditional_free' ? (
                  <div>
                    <div className={mod.label}>무료배송 기준 금액 (원)</div>
                    <input
                      className={mod.input}
                      type="text"
                      inputMode="numeric"
                      value={formatDigitsForInput(conditionalFreeThreshold)}
                      onChange={(e) => setConditionalFreeThreshold(e.target.value.replace(/\D/g, ''))}
                      placeholder="예: 50,000 (5만원 이상 무료배송)"
                    />
                    {/* TODO: 향후 free_shipping_threshold 컬럼 추가 후 DB 연결 예정 */}
                  </div>
                ) : null}

                <div>
                  <div className={mod.label}>묶음배송 그룹 (선택)</div>
                  <p className={mod.hint}>같은 그룹 상품끼리 묶음배송 가능합니다</p>
                  <input
                    className={mod.input}
                    type="text"
                    value={shippingGroup}
                    onChange={(e) => setShippingGroup(e.target.value)}
                    placeholder="예: 부평창고, 계양창고, A공장배송"
                  />
                  {/* TODO: 향후 shipping_group 컬럼 추가 후 DB 연결 예정 */}
                  {/* 묶음배송 그룹별 박스 계산 엔진은 다음 단계에서 별도 설계 */}
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>썸네일 뱃지</h2>
              <p className={mod.hint}>상품 카드 썸네일에 표시됩니다 (최대 2개)</p>
              <div className={mod.thumbBadgeToggle}>
                <div className={mod.thumbBadgeRow}>
                  {THUMBNAIL_BADGE_OPTIONS.map((opt) => {
                    const checked = thumbnailBadges.includes(opt.label)
                    const disabled = !checked && thumbnailBadges.length >= MAX_THUMB_BADGES
                    return (
                      <label
                        key={opt.label}
                        className={`${mod.thumbBadgeLabel} ${disabled ? mod.thumbBadgeLabelDisabled : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => setThumbnailBadges((prev) => toggleThumbBadge(prev, opt.label))}
                        />
                        {opt.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <h2 className={mod.sectionTitle}>상품 페이지 제작</h2>
              <p className={mod.hint}>구매자가 상세페이지에서 보는 내용을 만들어요</p>
              <div className={mod.fieldStack}>
                <div>
                  <div className={mod.label}>대표 이미지</div>
                  <label className={`${mod.uploadZone} ${uploadBusy || pending ? mod.uploadZoneDisabled : ''}`}>
                    대표 이미지 업로드
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
                    <img src={thumb} alt="" className={mod.uploadPreviewHero} width={120} height={120} />
                  ) : null}
                  <div>
                    <div className={mod.label}>또는 URL 직접 입력</div>
                    <input
                      className={mod.input}
                      value={thumbnailUrl}
                      onChange={(e) => setThumbnailUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <div className={mod.label}>상세 이미지</div>
                  <p className={mod.hint}>상품 상세페이지에 순서대로 표시됩니다 (최대 5개)</p>
                  <div className={mod.fieldStack}>
                    {detailImageUrls.map((url, index) => (
                      <div key={index} className={mod.detailImageCard}>
                        <div className={mod.detailImageCardMain}>
                          <input
                            className={mod.input}
                            value={url}
                            onChange={(e) => setDetailImageUrl(index, e.target.value)}
                            placeholder="https://..."
                          />
                          {url.trim() ? (
                            <img src={url.trim()} alt="" className={mod.detailThumb} width={60} height={60} />
                          ) : (
                            <div className={mod.detailThumb} aria-hidden />
                          )}
                        </div>
                        <button
                          type="button"
                          className={mod.btnGhost}
                          onClick={() => removeDetailImageSlot(index)}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={mod.btnAddImage}
                      onClick={addDetailImageSlot}
                      disabled={detailImageUrls.length >= MAX_DETAIL_IMAGES}
                    >
                      + 이미지 추가
                    </button>
                  </div>
                </div>

                <div>
                  <div className={mod.label}>상세 설명</div>
                  <textarea
                    className={`${mod.textarea} ${mod.textareaNoResize}`}
                    value={listingDescription}
                    onChange={(e) => setListingDescription(e.target.value)}
                    placeholder={
                      '원산지, 보관법, 유통기한, 사용법, 배송 안내 등\n예) 원산지: 국내산 / 보관: 냉장 / 유통기한: 제조일로부터 12개월'
                    }
                    rows={5}
                  />
                </div>
                <div>
                  <div className={mod.label}>내부 메모 (선택)</div>
                  <textarea
                    className={`${mod.textarea} ${mod.textareaNoResize}`}
                    value={adminMemo}
                    onChange={(e) => setAdminMemo(e.target.value)}
                    placeholder="구매자에게 보이지 않습니다"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className={mod.card}>
              {/* TODO: private / hidden / sold_out 상태 구조는
                  다음 단계에서 별도 작업 예정 */}
              <h2 className={mod.sectionTitle}>공개 설정</h2>
              <div className={mod.fieldStack}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#2b2b2b' }}>
                  <input type="radio" name="vis" checked={visibility === 'draft'} onChange={() => setVisibility('draft')} />
                  <span>
                    <strong>비공개</strong>
                    <span className={mod.hint} style={{ display: 'block', marginTop: 4 }}>
                      등록 후 직접 공개 처리합니다
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#2b2b2b' }}>
                  <input type="radio" name="vis" checked={visibility === 'visible'} onChange={() => setVisibility('visible')} />
                  <span>
                    <strong>공개</strong>
                    <span className={mod.hint} style={{ display: 'block', marginTop: 4 }}>
                      등록 즉시 구매 화면에 표시됩니다
                    </span>
                  </span>
                </label>
                <p className={mod.hint}>하단 버튼이 실제 저장 방식을 결정합니다.</p>
              </div>
            </div>
          </div>

          <div className={mod.previewColumn}>
            <div className={mod.previewSticky}>
              <div className={mod.previewTabs}>
                <button
                  type="button"
                  className={`${mod.previewTab} ${previewTab === 'card' ? mod.previewTabActive : ''}`}
                  onClick={() => setPreviewTab('card')}
                >
                  카드 미리보기
                </button>
                <button
                  type="button"
                  className={`${mod.previewTab} ${previewTab === 'detail' ? mod.previewTabActive : ''}`}
                  onClick={() => setPreviewTab('detail')}
                >
                  상세페이지
                </button>
              </div>

              {previewTab === 'card' ? (
                <>
                  <div className={mod.previewCard}>
                    <div style={{ position: 'relative', width: '100%' }}>
                      {renderImageOverlays()}
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
                    </div>
                  </div>
                  <p className={mod.previewFoot}>목록·검색에서 보이는 카드 형태입니다</p>
                </>
              ) : (
                <>
                  <div className={mod.previewCard} style={{ maxWidth: 280 }}>
                    <div className={mod.detailPreviewWrap}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        {renderImageOverlays()}
                        {thumb ? (
                          <img src={thumb} alt="" className={mod.detailPreviewHero} />
                        ) : (
                          <div
                            className={mod.detailPreviewHero}
                            style={{
                              minHeight: 120,
                              display: 'flex',
                              alignItems: 'center',
                              padding: 16,
                              boxSizing: 'border-box',
                            }}
                            aria-hidden
                          >
                            <PhBar width="100%" />
                          </div>
                        )}
                      </div>
                      <div className={mod.detailPreviewGrid}>
                        {detailUrlsForPreview.length > 0 ? (
                          detailUrlsForPreview.map((u, i) => (
                            <img key={`${i}-${u.slice(0, 24)}`} src={u} alt="" className={mod.detailPreviewImg} />
                          ))
                        ) : (
                          <PhBar width="100%" />
                        )}
                      </div>
                      <p className={mod.previewDescLabel} style={{ marginTop: 16 }}>
                        상세 설명
                      </p>
                      {descPreview ? (
                        <p className={mod.previewDescBody}>{listingDescription}</p>
                      ) : (
                        <PhBar width="100%" />
                      )}
                    </div>
                  </div>
                  <p className={mod.previewFoot}>상세페이지에 가까운 흐름입니다</p>
                </>
              )}
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
