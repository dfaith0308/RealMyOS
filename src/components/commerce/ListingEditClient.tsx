'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import {
  createShippingGroup,
  deleteShippingGroup,
  getAdminCategories,
  getShippingGroups,
  updateListingFull,
  updateShippingGroup,
  uploadListingImage,
  type AdminCategoryNode,
  type AdminCategoryRow,
  type ListingForEditData,
  type ListingShippingType,
  type ShippingGroupListItem,
} from '@/actions/admin/commerce'
import { LISTING_SHIPPING_TYPES } from '@/lib/commerce-constants'
import { formatDigitsForInput, formatKRW } from '@/lib/calc'
import mod from './listing-new-client.module.css'
import ProductDetailImageGenerator from './ProductDetailImageGenerator'
import { analyzeProductStrengths } from '@/actions/admin/ai-product-analysis'
import BarcodeLookupSection from '@/components/product/BarcodeLookupSection'
import type { ProductBarcodeApplyHints } from '@/components/product/BarcodeLookupSection'

const MAX_DETAIL_IMAGES = 20
const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024
/** 피커 필터(실제 허용은 validateImageFile과 동일 계열) */
const ACCEPT_IMAGE =
  'image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,image/heic,image/heif,application/octet-stream,.jpg,.jpeg,.png,.webp,.heic,.heif'
const MAX_THUMB_BADGES = 2
const THUMB_H = 160

function randomBlockId(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID()
    }
  } catch {
    /* 일부 환경(비보안 컨텍스트 등)에서 randomUUID 사용 불가 */
  }
  return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export type DetailImageBlock = {
  id: string
  url: string
  /** url: URL 추가 행 / file: 파일 업로드 행 */
  blockKind: 'url' | 'file'
  uploadStatus: 'idle' | 'uploading' | 'done_upload' | 'url_linked' | 'error'
  errorMessage?: string
  fileName?: string | null
}

function newBlock(partial?: Partial<DetailImageBlock>): DetailImageBlock {
  return {
    id: randomBlockId(),
    url: partial?.url ?? '',
    blockKind: partial?.blockKind ?? 'file',
    uploadStatus: partial?.uploadStatus ?? 'idle',
    errorMessage: partial?.errorMessage,
    fileName: partial?.fileName ?? null,
  }
}

function validateImageFile(file: File): string | null {
  if (file.size === 0) return '빈 파일입니다'
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return '8MB 이하 이미지만 업로드 가능합니다'
  }

  const mimeRaw = (file.type ?? '').trim()
  const mime = mimeRaw.toLowerCase()

  const extOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)

  const mimeOk =
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/pjpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    /^image\/heic/i.test(mime) ||
    /^image\/heif/i.test(mime)

  const octetOk = mime === 'application/octet-stream' && extOk

  if (extOk) return null
  if (mimeOk) return null
  if (octetOk) return null

  return 'JPG/PNG/WebP/HEIC·HEIF만 가능합니다(허용 확장자 또는 image/jpeg·png·webp·heic·heif, octet-stream은 확장자 필요)'
}

function blocksToSavedUrls(blocks: DetailImageBlock[]): string[] {
  return blocks
    .filter((b) => b.uploadStatus !== 'uploading' && b.uploadStatus !== 'error' && b.url.trim())
    .map((b) => b.url.trim())
}

function detailBlockStatusLabel(block: DetailImageBlock): string {
  if (block.uploadStatus === 'uploading') return '상태: 업로드 중'
  if (block.uploadStatus === 'error') return '상태: 업로드 실패'
  if (block.uploadStatus === 'done_upload') return '상태: 업로드 완료'
  if (block.uploadStatus === 'url_linked') return '상태: 외부 URL 연결'
  if (block.blockKind === 'url' && !block.url.trim()) return '상태: URL 입력 대기'
  if (block.url.trim()) return '상태: 미리보기'
  return '상태: 대기'
}

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
  shippingGroupId: string
  thumbnailBadges: string[]
  thumbnailUrl: string
  detailBlocks: DetailImageBlock[]
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
    shippingGroupId: '',
    thumbnailBadges: [],
    thumbnailUrl: '',
    detailBlocks: [],
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

function urlsToDetailBlocks(urls: string[]): DetailImageBlock[] {
  return urls.filter((u) => u.trim()).map((url) =>
    newBlock({ url: url.trim(), blockKind: 'url', uploadStatus: 'url_linked' }),
  )
}

function listingStorefrontPublished(row: ListingForEditData): boolean {
  return row.status === 'visible' && row.is_visible
}

function shippingTypeLabel(t: string): string {
  switch (t) {
    case 'paid':
      return '유료배송'
    case 'conditional_free':
      return '조건부 무료'
    case 'free':
    default:
      return '무료배송'
  }
}

function resolveRootSubCategoryIds(
  categoryFlat: AdminCategoryRow[],
  categoryId: string | null,
  subCategoryId: string | null,
): { rootCategoryId: string; subCategoryId: string } {
  if (subCategoryId) {
    const sub = categoryFlat.find((c) => c.id === subCategoryId)
    if (sub?.parent_id) return { rootCategoryId: sub.parent_id, subCategoryId }
  }
  if (categoryId) {
    const cat = categoryFlat.find((c) => c.id === categoryId)
    if (cat?.parent_id) return { rootCategoryId: cat.parent_id, subCategoryId: categoryId }
    return { rootCategoryId: categoryId, subCategoryId: '' }
  }
  return { rootCategoryId: '', subCategoryId: '' }
}

export default function ListingEditClient({
  initial,
  shippingGroups: initialShippingGroups,
}: {
  initial: ListingForEditData
  shippingGroups: ShippingGroupListItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)

  const [categoryFlat, setCategoryFlat] = useState<AdminCategoryRow[]>([])
  const [rootCategoryId, setRootCategoryId] = useState('')
  const [subCategoryId, setSubCategoryId] = useState('')

  const [brandName, setBrandName] = useState(initial.brand_name ?? '')
  const [productName, setProductName] = useState(initial.product_name)
  const [spec, setSpec] = useState(initial.spec ?? '')

  const [supplyPrice, setSupplyPrice] = useState('')
  const [commercePrice, setCommercePrice] = useState(String(initial.commerce_price))
  const [originalPrice, setOriginalPrice] = useState(
    initial.original_price != null && initial.original_price > 0 ? String(initial.original_price) : '',
  )
  const [marginMode, setMarginMode] = useState<'price' | 'margin'>('price')
  const [marginInput, setMarginInput] = useState('')

  const [shippingType, setShippingType] = useState<ListingShippingType>(
    (LISTING_SHIPPING_TYPES as readonly string[]).includes(initial.shipping_type)
      ? (initial.shipping_type as ListingShippingType)
      : 'free',
  )
  const [shippingBoxQty, setShippingBoxQty] = useState('')
  const [shippingBoxFee, setShippingBoxFee] = useState('')
  const [conditionalFreeThreshold, setConditionalFreeThreshold] = useState('')
  const [freeShippingQty, setFreeShippingQty] = useState(
    initial.free_shipping_qty != null && initial.free_shipping_qty > 0 ? String(initial.free_shipping_qty) : '',
  )
  const [bulkQty, setBulkQty] = useState(
    initial.bulk_qty != null && initial.bulk_qty > 0 ? String(initial.bulk_qty) : '',
  )
  const [bulkDiscountRate, setBulkDiscountRate] = useState(
    initial.bulk_discount_rate != null && initial.bulk_discount_rate > 0
      ? String(initial.bulk_discount_rate)
      : '',
  )
  const [baseShippingFee, setBaseShippingFee] = useState(
    initial.base_shipping_fee != null && initial.base_shipping_fee > 0
      ? String(initial.base_shipping_fee)
      : '3500',
  )
  const [boxQty, setBoxQty] = useState(String(initial.box_qty ?? 1))
  const [shippingGroupId, setShippingGroupId] = useState(initial.shipping_group_id ?? '')

  const [origin, setOrigin] = useState(initial.origin ?? '')
  const [storageMethod, setStorageMethod] = useState(initial.storage_method ?? '')
  const [minOrderQty, setMinOrderQty] = useState(String(initial.min_order_qty ?? 1))
  const [packageUnit, setPackageUnit] = useState(initial.package_unit ?? '')
  const [usageDesc, setUsageDesc] = useState(initial.usage_desc ?? '')
  const [allergen, setAllergen] = useState(initial.allergen ?? '')
  const [manufacturer, setManufacturer] = useState(initial.manufacturer ?? '')
  const [ingredients, setIngredients] = useState(initial.ingredients ?? '')
  const [barcode, setBarcode] = useState(initial.barcode ?? '')
  const [itemReportNumber, setItemReportNumber] = useState(initial.item_report_number ?? '')
  const [aiStrengths, setAiStrengths] = useState(initial.ai_strengths ?? '')
  const [aiUsage, setAiUsage] = useState(initial.ai_usage ?? '')
  const [aiSummary, setAiSummary] = useState(initial.ai_summary ?? '')
  const [analyzing, setAnalyzing] = useState(false)

  const [shippingGroups, setShippingGroups] = useState<ShippingGroupListItem[]>(initialShippingGroups)
  const [showAddShippingGroup, setShowAddShippingGroup] = useState(false)
  const [newShippingGroupName, setNewShippingGroupName] = useState('')
  const [shippingGroupActionBusy, setShippingGroupActionBusy] = useState(false)
  const [manageShippingModal, setManageShippingModal] = useState(false)
  const [modalEditGroupId, setModalEditGroupId] = useState<string | null>(null)
  const [modalEditName, setModalEditName] = useState('')
  const [modalEditDescription, setModalEditDescription] = useState('')

  const initialThumb = initial.thumbnail_url?.trim() ?? ''
  const initialImages = Array.isArray(initial.image_urls)
    ? initial.image_urls.filter((u) => String(u).trim())
    : []

  const [thumbnailBadges, setThumbnailBadges] = useState<string[]>(
    Array.isArray(initial.badge_labels) ? [...initial.badge_labels] : [],
  )

  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumb)
  const [showThumbUrlField, setShowThumbUrlField] = useState(Boolean(initialThumb && /^https?:\/\//i.test(initialThumb)))
  const [thumbUploadState, setThumbUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>(
    initialThumb ? 'success' : 'idle',
  )
  const [thumbFileMeta, setThumbFileMeta] = useState<{ name: string } | null>(null)
  const [thumbSource, setThumbSource] = useState<'none' | 'upload' | 'url'>(initialThumb ? 'url' : 'none')
  const [thumbPublicWarning, setThumbPublicWarning] = useState(false)
  const [detailBlocks, setDetailBlocks] = useState<DetailImageBlock[]>(() => urlsToDetailBlocks(initialImages))
  const [listingDescription, setListingDescription] = useState(initial.description ?? '')

  useEffect(() => {
    detailBlocksRef.current = detailBlocks
  }, [detailBlocks])

  const [adminMemo, setAdminMemo] = useState(initial.admin_memo ?? '')
  const [storefrontPublished, setStorefrontPublished] = useState(listingStorefrontPublished(initial))
  const discontinued = initial.status === 'discontinued'

  const thumbFileRef = useRef<HTMLInputElement>(null)
  const detailFilesRef = useRef<HTMLInputElement>(null)
  const detailBlocksRef = useRef<DetailImageBlock[]>([])

  const [previewTab, setPreviewTab] = useState<'card' | 'detail'>('card')

  const cost = parseInt(supplyPrice.replace(/\D/g, ''), 10) || 0

  const showToast = useCallback((text: string, variant: 'success' | 'error' = 'success') => {
    setToast({ text, variant })
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  const refreshShippingGroups = useCallback(async () => {
    const res = await getShippingGroups()
    if (!res.success) {
      showToast(res.error ?? '묶음배송 그룹 조회 실패', 'error')
      setShippingGroups([])
      return
    }
    setShippingGroups(res.data?.groups ?? [])
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    getAdminCategories().then((res) => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error ?? '카테고리 조회 실패')
        setCategoryFlat([])
        return
      }
      const flat = flattenAdminCategoryTree(res.data?.tree ?? [])
      setCategoryFlat(flat)
      const { rootCategoryId: root, subCategoryId: sub } = resolveRootSubCategoryIds(
        flat,
        initial.category_id,
        initial.sub_category_id ?? null,
      )
      setRootCategoryId(root)
      setSubCategoryId(sub)
    })
    return () => {
      cancelled = true
    }
  }, [initial.category_id, initial.sub_category_id])

  useEffect(() => {
    void refreshShippingGroups()
  }, [refreshShippingGroups])

  useEffect(() => {
    if (thumbnailUrl.trim()) setThumbPublicWarning(false)
  }, [thumbnailUrl])

  useEffect(() => {
    if (!storefrontPublished) setThumbPublicWarning(false)
  }, [storefrontPublished])

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

  const PG_FEE_RATE_PRICE = 0.033
  const marginRateDisplay = (() => {
    if (previewPrice == null || cost <= 0) return null
    const netPrice = previewPrice * (1 - PG_FEE_RATE_PRICE)
    const rate = ((netPrice - cost) / netPrice) * 100
    if (!isFinite(rate) || isNaN(rate)) return null
    return rate
  })()

  // 배송 정책 마진 계산
  const PG_FEE_RATE = 0.033 // 토스페이먼츠 기준 PG 수수료 3.3%
  const costNum = parseInt(supplyPrice.replace(/\D/g, ''), 10) || 0
  const priceNum = parseInt(commercePrice.replace(/\D/g, ''), 10) || 0
  const originalPriceNum = parseInt(originalPrice.replace(/\D/g, ''), 10) || 0
  const customerDiscountRate =
    originalPriceNum > 0 && previewPrice != null && originalPriceNum > previewPrice
      ? ((originalPriceNum - previewPrice) / originalPriceNum) * 100
      : null
  const shippingFeeNum = parseInt(baseShippingFee.replace(/\D/g, ''), 10) || 0
  const freeQtyNum = parseInt(freeShippingQty.replace(/\D/g, ''), 10) || 0
  const bulkQtyNum = parseInt(bulkQty.replace(/\D/g, ''), 10) || 0
  const boxQtyNum = parseInt(boxQty.replace(/\D/g, ''), 10) || 1
  const bulkRateNum = parseFloat(bulkDiscountRate) || 0

  // 수량에 따른 실제 배송비 계산
  function calcShippingCost(qty: number): number {
    if (freeQtyNum > 0 && qty >= freeQtyNum) return 0
    const boxes = Math.ceil(qty / boxQtyNum)
    return boxes * shippingFeeNum
  }

  const singleShippingCost = calcShippingCost(1)
  // 낱개: 배송비 고객 부담 → 우리 마진에 배송비 미반영
  const singleMargin =
    costNum > 0 && priceNum > 0
      ? ((priceNum * (1 - PG_FEE_RATE) - costNum) / (priceNum * (1 - PG_FEE_RATE))) * 100
      : null

  const freeShippingCost = freeQtyNum > 0 ? calcShippingCost(freeQtyNum) : 0
  // 무료배송: 배송비 우리 부담 → 우리 마진 = (판매가*수량 - 공급가*수량 - 배송비) / (판매가*수량)
  const freeShippingMargin =
    costNum > 0 && priceNum > 0 && freeQtyNum > 0
      ? ((priceNum * (1 - PG_FEE_RATE) * freeQtyNum - costNum * freeQtyNum - freeShippingCost) /
          (priceNum * (1 - PG_FEE_RATE) * freeQtyNum)) *
        100
      : null

  // 대량구매: 할인 적용가 기준 마진 (배송비 우리 부담)
  const bulkPrice =
    priceNum > 0 && bulkRateNum > 0 ? Math.round(priceNum * (1 - bulkRateNum / 100)) : priceNum
  const bulkShippingCost = bulkQtyNum > 0 ? calcShippingCost(bulkQtyNum) : 0
  const bulkMargin =
    costNum > 0 && bulkPrice > 0 && bulkQtyNum > 0
      ? ((bulkPrice * (1 - PG_FEE_RATE) * bulkQtyNum - costNum * bulkQtyNum - bulkShippingCost) /
          (bulkPrice * (1 - PG_FEE_RATE) * bulkQtyNum)) *
        100
      : null

  // 정상가 대비 할인율
  const singleDiscountRate =
    originalPriceNum > 0 && priceNum > 0 && originalPriceNum > priceNum
      ? ((originalPriceNum - priceNum) / originalPriceNum) * 100
      : null
  const bulkDiscountDisplay =
    originalPriceNum > 0 && bulkPrice > 0 && originalPriceNum > bulkPrice
      ? ((originalPriceNum - bulkPrice) / originalPriceNum) * 100
      : null

  function marginBadge(rate: number | null): {
    label: string
    bg: string
    border: string
    color: string
  } {
    if (rate === null) return { label: '—', bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280' }
    if (rate <= 10)
      return { label: `${rate.toFixed(1)}% 🔴 위험`, bg: '#fef2f2', border: '#fecaca', color: '#dc2626' }
    if (rate <= 16)
      return { label: `${rate.toFixed(1)}% 🟡 주의`, bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
    return { label: `${rate.toFixed(1)}% 🟢 정상`, bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' }
  }

  function handleMarginInput(v: string) {
    setMarginInput(v)
    const m = Number(v) / 100
    const PG = 0.033
    if (cost > 0 && m > 0 && m < 1) {
      setCommercePrice(String(Math.round(cost / ((1 - m) * (1 - PG)))))
    }
  }

  const boxTierPreview = useMemo(
    () => buildBoxShippingTierPreview(shippingBoxQty, shippingBoxFee),
    [shippingBoxQty, shippingBoxFee],
  )

  async function uploadHeroFile(file: File) {
    const v = validateImageFile(file)
    if (v) {
      setUploadError(v)
      setThumbUploadState('error')
      return
    }
    setUploadError(null)
    setThumbUploadState('uploading')
    setThumbSource('upload')
    const fd = new FormData()
    fd.set('file', file)
    try {
      const res = await uploadListingImage(fd)
      if (!res.success) {
        setUploadError(res.error ?? '이미지 업로드에 실패했습니다.')
        setThumbUploadState('error')
        return
      }
      const url = res.data?.url ?? ''
      setThumbnailUrl(url)
      setThumbFileMeta({ name: file.name })
      setThumbUploadState('success')
      if (url.trim()) setThumbPublicWarning(false)
    } catch {
      setUploadError('네트워크 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      setThumbUploadState('error')
    }
  }

  function onHeroFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void uploadHeroFile(file)
  }

  function onHeroDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending || thumbUploadState === 'uploading') return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    void uploadHeroFile(file)
  }

  async function uploadDetailBlockFile(blockId: string, file: File) {
    try {
      const v = validateImageFile(file)
      if (v) {
        setDetailBlocks((prev) => {
          const idx = prev.findIndex((x) => x.id === blockId)
          if (idx === -1) return prev
          return prev.map((b) =>
            b.id === blockId ? { ...b, uploadStatus: 'error' as const, errorMessage: v } : b,
          )
        })
        return
      }
      setDetailBlocks((prev) => {
        const idx = prev.findIndex((x) => x.id === blockId)
        if (idx === -1) {
          if (prev.length >= MAX_DETAIL_IMAGES) return prev
          return [
            ...prev,
            {
              id: blockId,
              url: '',
              blockKind: 'file' as const,
              uploadStatus: 'uploading' as const,
              fileName: file.name,
              errorMessage: undefined,
            },
          ]
        }
        return prev.map((b) =>
          b.id === blockId
            ? { ...b, uploadStatus: 'uploading' as const, errorMessage: undefined }
            : b,
        )
      })
      const fd = new FormData()
      fd.set('file', file)
      try {
        const res = await uploadListingImage(fd)
        if (!res.success) {
          const errMsg = res.error ?? '이미지 업로드에 실패했습니다.'
          console.error('[ListingNew] uploadListingImage failed', errMsg)
          setDetailBlocks((prev) => {
            const idx = prev.findIndex((x) => x.id === blockId)
            if (idx === -1) {
              queueMicrotask(() => showToast(errMsg, 'error'))
              return prev
            }
            return prev.map((b) =>
              b.id === blockId
                ? { ...b, uploadStatus: 'error' as const, errorMessage: errMsg }
                : b,
            )
          })
          return
        }
        const url = res.data?.url ?? ''
        setDetailBlocks((prev) => {
          const idx = prev.findIndex((x) => x.id === blockId)
          if (idx === -1) {
            if (prev.length >= MAX_DETAIL_IMAGES) return prev
            return [
              ...prev,
              {
                id: blockId,
                url,
                blockKind: 'file' as const,
                uploadStatus: 'done_upload' as const,
                fileName: file.name,
                errorMessage: undefined,
              },
            ]
          }
          return prev.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  url,
                  uploadStatus: 'done_upload' as const,
                  fileName: file.name,
                  errorMessage: undefined,
                }
              : b,
          )
        })
        if (url.trim()) {
          showToast(file.name ? `업로드 완료 · ${file.name}` : '상세 이미지 업로드 완료')
        }
      } catch (netErr) {
        const errMsg = '네트워크 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        console.error('[ListingNew] uploadDetailBlockFile network error', netErr)
        setDetailBlocks((prev) => {
          const idx = prev.findIndex((x) => x.id === blockId)
          if (idx === -1) {
            queueMicrotask(() => showToast(errMsg, 'error'))
            return prev
          }
          return prev.map((b) =>
            b.id === blockId
              ? { ...b, uploadStatus: 'error' as const, errorMessage: errMsg }
              : b,
          )
        })
      }
    } catch (fatal) {
      console.error('[ListingNew] uploadDetailBlockFile fatal', fatal)
    }
  }

  function addDetailUrlRow() {
    setDetailBlocks((prev) => {
      if (prev.length >= MAX_DETAIL_IMAGES) return prev
      return [...prev, newBlock({ url: '', blockKind: 'url', uploadStatus: 'idle' })]
    })
  }

  /**
   * 파일 선택/드롭 직시 검증·블록 추가(업로드 중)·flushSync 커밋 후 서버 업로드.
   */
  function processIncomingDetailFiles(fileArr: File[]) {
    try {
      const pairs: { file: File; block: DetailImageBlock }[] = []
      const rejectSamples: string[] = []
      for (const file of fileArr) {
        const err = validateImageFile(file)
        if (err) {
          if (rejectSamples.length < MAX_DETAIL_IMAGES) {
            rejectSamples.push(`${file.name} | MIME:${file.type || '(empty)'} | ${err}`)
          }
          continue
        }
        try {
          const block = newBlock({
            url: '',
            blockKind: 'file',
            uploadStatus: 'uploading',
            fileName: file.name,
          })
          pairs.push({ file, block })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[ListingNew] newBlock failed', msg)
          showToast('상세 이미지 블록을 만들 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.', 'error')
          return
        }
      }

      if (pairs.length === 0) {
        showToast(
          rejectSamples[0] ??
            `선택한 ${fileArr.length}개를 상세 이미지로 추가할 수 없습니다(형식·용량 확인).`,
          'error',
        )
        return
      }

      let uploadJobs: { file: File; id: string }[] = []
      const appendReducer = (prev: DetailImageBlock[]) => {
        try {
          const room = Math.max(0, MAX_DETAIL_IMAGES - prev.length)
          const slice = pairs.slice(0, room)
          uploadJobs = slice.map((p) => ({ file: p.file, id: p.block.id }))
          const next =
            slice.length === 0 ? prev : [...prev, ...slice.map((p) => p.block)]
          return next
        } catch (redErr) {
          console.error('[ListingNew] appendReducer error', redErr)
          throw redErr
        }
      }

      try {
        flushSync(() => {
          setDetailBlocks(appendReducer)
        })
      } catch (e) {
        console.error('[ListingNew] flushSync error', e)
        setDetailBlocks(appendReducer)
        requestAnimationFrame(() => {
          for (const j of uploadJobs) {
            void uploadDetailBlockFile(j.id, j.file).catch((upErr) => {
              console.error('[ListingNew] upload after flushSync catch', upErr)
            })
          }
        })
        if (uploadJobs.length < pairs.length) {
          showToast(`상세 이미지는 최대 ${MAX_DETAIL_IMAGES}장까지입니다`, 'error')
        }
        return
      }

      if (uploadJobs.length < pairs.length) {
        showToast(`상세 이미지는 최대 ${MAX_DETAIL_IMAGES}장까지입니다`, 'error')
      }

      for (const j of uploadJobs) {
        void uploadDetailBlockFile(j.id, j.file).catch((upErr) => {
          console.error('[ListingNew] uploadDetailBlockFile promise rejection', upErr)
        })
      }
    } catch (outer) {
      console.error('[ListingNew] processIncomingDetailFiles outer error', outer)
      showToast('상세 이미지 추가 중 오류가 발생했습니다. 콘솔을 확인해 주세요.', 'error')
    }
  }

  function prependIncomingDetailFiles(fileArr: File[]) {
    try {
      const pairs: { file: File; block: DetailImageBlock }[] = []
      for (const file of fileArr) {
        const err = validateImageFile(file)
        if (err) {
          showToast(`${file.name} | ${err}`, 'error')
          continue
        }
        const block = newBlock({
          url: '',
          blockKind: 'file',
          uploadStatus: 'uploading',
          fileName: file.name,
        })
        pairs.push({ file, block })
      }
      if (pairs.length === 0) return

      let uploadJobs: { file: File; id: string }[] = []
      const prependReducer = (prev: DetailImageBlock[]) => {
        const room = Math.max(0, MAX_DETAIL_IMAGES - prev.length)
        const slice = pairs.slice(0, room)
        uploadJobs = slice.map((p) => ({ file: p.file, id: p.block.id }))
        return slice.length === 0 ? prev : [...slice.map((p) => p.block), ...prev]
      }

      flushSync(() => {
        setDetailBlocks(prependReducer)
      })

      if (uploadJobs.length < pairs.length) {
        showToast(`상세 이미지는 최대 ${MAX_DETAIL_IMAGES}장까지입니다`, 'error')
      }

      for (const j of uploadJobs) {
        void uploadDetailBlockFile(j.id, j.file).catch((upErr) => {
          console.error('[ListingNew] prepend uploadDetailBlockFile rejection', upErr)
        })
      }
    } catch (outer) {
      console.error('[ListingNew] prependIncomingDetailFiles error', outer)
      showToast('상세 이미지 추가 중 오류가 발생했습니다.', 'error')
    }
  }

  function addDetailFilesFromPicker(e: React.ChangeEvent<HTMLInputElement>) {
    /** FileList는 input과 라이브 연결됨 — value 초기화 후에는 같은 참조가 비어 보임. 반드시 먼저 배열 스냅샷. */
    const filesArr = Array.from(e.currentTarget.files ?? [])
    if (filesArr.length === 0) {
      return
    }
    processIncomingDetailFiles(filesArr)
    e.currentTarget.value = ''
  }

  function onDetailListDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    const files = e.dataTransfer.files
    if (files?.length) processIncomingDetailFiles(Array.from(files))
  }

  function parseOriginal(): number | null {
    const raw = originalPrice.replace(/\D/g, '')
    if (!raw) return null
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const r = await analyzeProductStrengths({
        productName,
        brandName,
        spec,
        ingredients: ingredients.trim(),
        origin,
        usageDesc,
        manufacturer: manufacturer.trim(),
      })
      if (r.success) {
        setAiStrengths(r.strengths ?? '')
        setAiUsage(r.usage ?? '')
        setAiSummary(r.summary ?? '')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const [retryDetailId, setRetryDetailId] = useState<string | null>(null)
  const retryDetailFileRef = useRef<HTMLInputElement>(null)

  function removeDetailBlock(id: string) {
    setDetailBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  function clearAllDetailImages() {
    if (!detailBlocks.length) return
    if (!window.confirm('상세 이미지를 모두 삭제할까요?')) return
    setDetailBlocks([])
  }

  function reorderDetailBlocks(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setDetailBlocks((prev) => {
      const next = [...prev]
      const [removed] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, removed)
      return next
    })
  }

  function setDetailBlockUrl(id: string, url: string) {
    const t = url.trim()
    setDetailBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b
        if (!t) return { ...b, url: '', uploadStatus: 'idle' as const }
        const linked = /^https?:\/\//i.test(t)
        return {
          ...b,
          url,
          uploadStatus: linked ? ('url_linked' as const) : ('idle' as const),
          fileName: null,
          errorMessage: undefined,
        }
      }),
    )
  }

  function startRetryDetailUpload(blockId: string) {
    setRetryDetailId(blockId)
    retryDetailFileRef.current?.click()
  }

  function onRetryDetailFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const id = retryDetailId
    e.target.value = ''
    setRetryDetailId(null)
    if (!file || !id) return
    void uploadDetailBlockFile(id, file)
  }

  function applyBarcodeHints(h: ProductBarcodeApplyHints) {
    if (h.name) setProductName(h.name)
    if (h.manufacturer) setManufacturer(h.manufacturer)
    if (h.ingredients) setIngredients(h.ingredients)
    if (h.barcode) setBarcode(h.barcode)
    if (h.item_report_number) setItemReportNumber(h.item_report_number)
    if (h.costPrice) setSupplyPrice(String(h.costPrice))
    if (h.storage_method) setStorageMethod(h.storage_method)
    if (h.allergen) setAllergen(h.allergen)
    if (h.origin) setOrigin(h.origin)
  }

  function saveListing() {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    if (storefrontPublished && !thumbnailUrl.trim()) {
      setThumbPublicWarning(true)
    } else {
      setThumbPublicWarning(false)
    }
    const pn = productName.trim()
    if (!pn) {
      setError('상품명을 입력해 주세요')
      showToast('상품명을 입력해 주세요', 'error')
      setIsSubmitting(false)
      return
    }
    if (!rootCategoryId) {
      setError('대분류 카테고리를 선택해 주세요')
      showToast('대분류 카테고리를 선택해 주세요', 'error')
      setIsSubmitting(false)
      return
    }
    if (!effectiveCategoryId) {
      setError('카테고리를 선택해 주세요')
      showToast('카테고리를 선택해 주세요', 'error')
      setIsSubmitting(false)
      return
    }
    const price = parseInt(commercePrice.replace(/\D/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) {
      setError('식식이 판매가는 1원 이상 정수로 입력해 주세요')
      showToast('식식이 판매가는 1원 이상 정수로 입력해 주세요', 'error')
      setIsSubmitting(false)
      return
    }
    if (discontinued && storefrontPublished) {
      setError('판매중단 상품은 공개할 수 없습니다')
      showToast('판매중단 상품은 공개할 수 없습니다', 'error')
      setIsSubmitting(false)
      return
    }

    const op = parseOriginal()
    const image_urls = blocksToSavedUrls(detailBlocks)
    const badge_labels = thumbnailBadges.length > 0 ? thumbnailBadges : null
    const description = listingDescription.trim() || null

    startTransition(async () => {
      try {
        const r = await updateListingFull({
          listing_id: initial.id,
          product_name: pn,
          brand_name: brandName.trim() || null,
          spec: spec.trim() || null,
          category_id: effectiveCategoryId,
          commerce_price: price,
          original_price: op,
          storefront_published: discontinued ? false : storefrontPublished,
          shipping_type: shippingType,
          shipping_group_id: shippingGroupId.trim() || null,
          badge_labels,
          admin_memo: adminMemo.trim() || null,
          description,
          ai_strengths: aiStrengths.trim() || null,
          ai_usage: aiUsage.trim() || null,
          ai_summary: aiSummary.trim() || null,
          thumbnail_url: thumbnailUrl.trim() || null,
          image_urls: image_urls.length > 0 ? image_urls : null,
          base_shipping_fee: shippingFeeNum || 3500,
          free_shipping_qty: freeQtyNum || null,
          bulk_qty: bulkQtyNum || null,
          bulk_discount_rate: bulkRateNum || null,
          box_qty: boxQtyNum > 0 ? boxQtyNum : 1,
          origin: origin.trim() || null,
          storage_method: storageMethod.trim() || null,
          min_order_qty: minOrderQty ? Number(minOrderQty) : 1,
          package_unit: packageUnit.trim() || null,
          usage_desc: usageDesc.trim() || null,
          allergen: allergen.trim() || null,
          ingredients: ingredients.trim() || null,
          manufacturer: manufacturer.trim() || null,
          barcode: barcode.trim() || null,
          item_report_number: itemReportNumber.trim() || null,
        })
        if (!r.success) {
          const msg = r.error ?? '저장에 실패했습니다'
          setError(msg)
          showToast(msg, 'error')
          setIsSubmitting(false)
          return
        }
        showToast('저장되었습니다')
        setIsSubmitting(false)
        router.push('/admin/commerce/products')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        showToast('저장 중 오류가 발생했습니다.', 'error')
        setIsSubmitting(false)
      }
    })
  }

  const thumb = thumbnailUrl.trim()
  const descPreview = listingDescription.trim()
  const detailUrlsForPreview = blocksToSavedUrls(detailBlocks)
  /** 업로드 중인 슬롯·저장 가능한 URL이 있는 블록(오류만 제외). 빈 URL 행(idle)은 제외 */
  const detailRegisteredCount = useMemo(
    () =>
      detailBlocks.filter((b) => {
        if (b.uploadStatus === 'error') return false
        if (b.uploadStatus === 'uploading') return true
        return Boolean(b.url.trim())
      }).length,
    [detailBlocks],
  )
  const marginModeDisabled = cost <= 0

  function renderImageOverlays() {
    if (thumbnailBadges.length === 0) return null
    return (
      <div className={mod.badgeStack}>
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
      </div>
    )
  }

  async function submitNewShippingGroup() {
    const n = newShippingGroupName.trim()
    if (!n) {
      showToast('그룹명을 입력해 주세요', 'error')
      return
    }
    setShippingGroupActionBusy(true)
    const res = await createShippingGroup({ name: n })
    setShippingGroupActionBusy(false)
    if (!res.success) {
      showToast(res.error ?? '그룹 추가 실패', 'error')
      return
    }
    await refreshShippingGroups()
    setShippingGroupId(res.data?.id ?? '')
    setNewShippingGroupName('')
    setShowAddShippingGroup(false)
    showToast('묶음배송 그룹이 추가되었습니다')
  }

  async function saveModalGroupEdit() {
    if (!modalEditGroupId) return
    setShippingGroupActionBusy(true)
    const res = await updateShippingGroup(modalEditGroupId, {
      name: modalEditName,
      description: modalEditDescription,
    })
    setShippingGroupActionBusy(false)
    if (!res.success) {
      showToast(res.error ?? '저장 실패', 'error')
      return
    }
    setModalEditGroupId(null)
    await refreshShippingGroups()
    showToast('저장했습니다')
  }

  async function removeShippingGroup(id: string) {
    if (
      !window.confirm(
        '이 묶음배송 그룹을 비활성화할까요? (사용 중인 상품이 있으면 삭제되지 않습니다)',
      )
    ) {
      return
    }
    setShippingGroupActionBusy(true)
    const res = await deleteShippingGroup(id)
    setShippingGroupActionBusy(false)
    if (!res.success) {
      showToast(res.error ?? '삭제 실패', 'error')
      return
    }
    if (shippingGroupId === id) setShippingGroupId('')
    setModalEditGroupId(null)
    await refreshShippingGroups()
    showToast('그룹을 비활성화했습니다')
  }

  function openManageShippingModal() {
    setModalEditGroupId(null)
    setManageShippingModal(true)
    void refreshShippingGroups()
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
            background: toast.variant === 'success' ? '#15803d' : '#b91c1c',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 'min(92vw, 420px)',
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          {toast.text}
        </div>
      ) : null}

      {manageShippingModal ? (
        <div
          className={mod.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shipping-group-manage-title"
          onClick={() => {
            if (!shippingGroupActionBusy) setManageShippingModal(false)
          }}
        >
          <div className={mod.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div className={mod.modalHeader}>
              <h3 id="shipping-group-manage-title" className={mod.modalTitle}>
                묶음배송 그룹 관리
              </h3>
              <button
                type="button"
                className={mod.btnGhost}
                onClick={() => setManageShippingModal(false)}
                disabled={shippingGroupActionBusy}
              >
                닫기
              </button>
            </div>
            <div className={mod.modalBody}>
              {shippingGroups.length === 0 ? (
                <p className={mod.hint}>등록된 그룹이 없습니다</p>
              ) : (
                shippingGroups.map((g) => (
                  <div key={g.id} className={mod.modalGroupRow}>
                    {modalEditGroupId === g.id ? (
                      <div className={mod.modalGroupEdit}>
                        <input
                          className={mod.input}
                          value={modalEditName}
                          onChange={(e) => setModalEditName(e.target.value)}
                          placeholder="그룹명"
                          disabled={shippingGroupActionBusy}
                        />
                        <input
                          className={mod.input}
                          value={modalEditDescription}
                          onChange={(e) => setModalEditDescription(e.target.value)}
                          placeholder="설명 (선택)"
                          disabled={shippingGroupActionBusy}
                        />
                        <div className={mod.modalRowActions}>
                          <button
                            type="button"
                            className={mod.btnGhost}
                            onClick={() => void saveModalGroupEdit()}
                            disabled={shippingGroupActionBusy}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            className={mod.btnGhost}
                            onClick={() => setModalEditGroupId(null)}
                            disabled={shippingGroupActionBusy}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={mod.modalGroupRowView}>
                        <div className={mod.modalGroupSummary}>
                          <strong>{g.name}</strong>
                          {g.description ? (
                            <span className={mod.hint} style={{ display: 'block', marginTop: 4 }}>
                              {g.description}
                            </span>
                          ) : null}
                        </div>
                        <div className={mod.modalRowActions}>
                          <button
                            type="button"
                            className={mod.btnGhost}
                            onClick={() => {
                              setModalEditGroupId(g.id)
                              setModalEditName(g.name)
                              setModalEditDescription(g.description ?? '')
                            }}
                            disabled={shippingGroupActionBusy}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className={mod.btnGhost}
                            onClick={() => void removeShippingGroup(g.id)}
                            disabled={shippingGroupActionBusy}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className={mod.shell}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 500, color: 'var(--ds-text-primary)', margin: '0 0 3px' }}>상품 수정</h1>
            <p style={{ fontSize: 12, color: 'var(--ds-text-secondary)', margin: 0 }}>등록 화면과 동일한 편집 · 저장 시 목록으로 이동합니다</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin/commerce/products" style={{ padding: '7px 13px', border: '1px solid var(--ds-border-default)', borderRadius: 8, background: 'transparent', fontSize: 12, color: 'var(--ds-text-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>취소</Link>
          </div>
        </div>
        <div className={mod.layout}>
          <div className={mod.formColumn}>
            {error ? <div className={mod.errorCard}>{error}</div> : null}
            {thumbPublicWarning ? (
              <div className={mod.warnBanner} role="status">
                공개 저장 시 대표 썸네일이 없습니다. 카드·목록 노출이 약해질 수 있습니다. 저장은 계속됩니다.
              </div>
            ) : null}

            <div className={mod.card}>
              <p className={mod.sectionLabel}>바코드 · 자동 입력</p>
              <BarcodeLookupSection
                categories={categoryFlat.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id ?? null }))}
                onApply={applyBarcodeHints}
              />
              <div className={mod.grid2} style={{ marginTop: 12 }}>
                <div>
                  <label className={mod.fieldLabel}>바코드</label>
                  <input
                    className={mod.input}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
                    placeholder="예: 8801234567890"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className={mod.fieldLabel}>품목보고번호</label>
                  <input
                    className={mod.input}
                    value={itemReportNumber}
                    onChange={(e) => setItemReportNumber(e.target.value.trim())}
                    placeholder="예: 20220123456789"
                  />
                </div>
              </div>
            </div>

            <div className={mod.card}>
              <div className={mod.sectionHeaderRow}>
                <p className={mod.sectionLabel}>카테고리</p>
                <Link href="/admin/commerce/categories" className={mod.linkMuted}>
                  카테고리 관리
                </Link>
              </div>
              <div className={mod.grid2}>
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
              <p className={mod.sectionLabel}>기본 정보</p>
              <div className={mod.grid2}>
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
                  <div className={mod.label}>규격·용량</div>
                  <input
                    className={mod.input}
                    value={spec}
                    onChange={(e) => setSpec(e.target.value)}
                    placeholder="예: 18L, 5kg × 2개, 1kg 낱개"
                  />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className={mod.label}>상품명 · 필수</div>
                <input
                  className={mod.input}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 업소용 식용유, 진간장, 냉동 삼겹살"
                />
              </div>
            </div>

            <div className={mod.card}>
              <p className={mod.sectionLabel}>가격</p>
              <div className={mod.modeBtnRow} style={{ marginBottom: 10 }}>
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
              <div className={mod.grid3}>
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
                  <p className={mod.fieldHint}>내부 운영용. 구매자에게 노출 안 됨</p>
                </div>
                <div>
                  {marginMode === 'price' ? (
                    <>
                      <div className={mod.label}>식식이 판매가 (원) · 필수</div>
                      <input
                        className={mod.input}
                        inputMode="numeric"
                        type="text"
                        value={formatDigitsForInput(commercePrice)}
                        onChange={(e) => setCommercePrice(e.target.value.replace(/\D/g, ''))}
                        placeholder="예: 22,900"
                      />
                      {marginRateDisplay != null ? (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '7px 10px',
                            border: `1px solid ${marginBadge(marginRateDisplay).border}`,
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            background: marginBadge(marginRateDisplay).bg,
                            color: marginBadge(marginRateDisplay).color,
                          }}
                        >
                          마진율 (PG 3.3%): {marginBadge(marginRateDisplay).label}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className={mod.label}>마진율 (%)</div>
                      <input
                        className={mod.input}
                        type="number"
                        value={marginInput}
                        onChange={(e) => handleMarginInput(e.target.value)}
                        placeholder="마진율 %"
                        min={0}
                        max={99}
                      />
                      {commercePrice ? (
                        <p className={mod.fieldHintGreen}>
                          → {formatKRW(Number(commercePrice.replace(/\D/g, '') || 0))}
                        </p>
                      ) : (
                        <p className={mod.fieldHint}>공급가를 먼저 입력한 뒤 사용</p>
                      )}
                    </>
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
                  {customerDiscountRate != null ? (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#1f5d3a', fontWeight: 600 }}>
                      고객 할인율 {customerDiscountRate.toFixed(1)}% — {formatKRW(originalPriceNum - previewPrice!)} 절감
                    </p>
                  ) : (
                    <p className={mod.fieldHint}>판매가보다 클 때만 표시</p>
                  )}
                </div>
              </div>
              {savingsAmount != null && savingsAmount > 0 ? (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: '#1f5d3a' }}>절감액: {formatKRW(savingsAmount)}</p>
              ) : null}
            </div>

            <div className={mod.card}>
              <p className={mod.sectionLabel}>상품 상세 정보</p>
              <div className={mod.grid3}>
                <div>
                  <label className={mod.fieldLabel}>원산지</label>
                  <input className={mod.input} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="예: 국산 대두 95%" />
                </div>
                <div>
                  <label className={mod.fieldLabel}>보관방법</label>
                  <input className={mod.input} value={storageMethod} onChange={(e) => setStorageMethod(e.target.value)} placeholder="예: 냉장 보관" />
                </div>
                <div>
                  <label className={mod.fieldLabel}>최소주문수량</label>
                  <input className={mod.input} inputMode="numeric" value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value.replace(/\D/g, ''))} placeholder="예: 1" />
                </div>
              </div>
              <div className={mod.grid2} style={{ marginTop: 10 }}>
                <div>
                  <label className={mod.fieldLabel}>포장단위</label>
                  <input className={mod.input} value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)} placeholder="예: 낱개, 박스(10개입)" />
                </div>
                <div>
                  <label className={mod.fieldLabel}>알레르기</label>
                  <input className={mod.input} value={allergen} onChange={(e) => setAllergen(e.target.value)} placeholder="예: 대두 함유" />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label className={mod.fieldLabel}>제조원</label>
                <input
                  className={mod.input}
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  placeholder="예: ㈜해나음식품"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <label className={mod.fieldLabel}>원재료명 및 함량 (선택)</label>
                <textarea
                  className={mod.input}
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  placeholder="예: 개량메주 40%(중국산,대두99.5%,황곡0.5%), 천일염 13.8%, 정제수 46.2%"
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
                <p className={mod.fieldHint}>입력 시 AI가 제품 강점을 자동으로 분석합니다</p>
                <button
                  type="button"
                  onClick={() => void handleAnalyze()}
                  disabled={analyzing}
                  style={{
                    marginTop: 8,
                    padding: '7px 14px',
                    background: analyzing ? '#9ca3af' : '#1f5d3a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {analyzing ? '분석 중...' : '🤖 AI 강점 분석'}
                </button>
                {aiSummary && (
                  <div style={{ padding: '12px 16px', background: '#1f5d3a', borderRadius: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>식식이 한줄평</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: 0 }}>{aiSummary}</p>
                  </div>
                )}
                {aiStrengths && (
                  <div style={{ padding: '12px 16px', background: '#f0f7f3', borderRadius: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: '#1f5d3a', fontWeight: 600, margin: '0 0 4px' }}>특징 및 강점</p>
                    <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{aiStrengths}</p>
                  </div>
                )}
                {aiUsage && (
                  <div style={{ padding: '12px 16px', background: '#f7f6f2', borderRadius: 8 }}>
                    <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, margin: '0 0 4px' }}>활용 메뉴</p>
                    <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{aiUsage}</p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <label className={mod.fieldLabel}>상품 설명</label>
                <textarea
                  className={mod.input}
                  value={listingDescription}
                  onChange={(e) => setListingDescription(e.target.value)}
                  placeholder="AI 강점 분석 결과 또는 직접 입력"
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <label className={mod.fieldLabel}>용도 (메뉴 기준)</label>
                <input className={mod.input} value={usageDesc} onChange={(e) => setUsageDesc(e.target.value)} placeholder="예: 한식당 된장찌개, 청국장 전용" style={{ width: '100%', boxSizing: 'border-box' }} />
                <p className={mod.fieldHint}>메뉴를 등록한 고객에게는 AI가 맞춤 용도로 표시합니다</p>
              </div>
            </div>

            <div className={mod.card}>
              <p className={mod.sectionLabel}>배송 정책</p>

              {/* 기준값 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label className={mod.fieldLabel}>공급가 (원) — 자동</label>
                  <input
                    className={mod.input}
                    value={supplyPrice ? formatDigitsForInput(supplyPrice) + '원' : '—'}
                    readOnly
                    style={{ background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}
                  />
                </div>
                <div>
                  <label className={mod.fieldLabel}>기본 배송비 (원)</label>
                  <input
                    className={mod.input}
                    type="text"
                    inputMode="numeric"
                    value={formatDigitsForInput(baseShippingFee)}
                    onChange={(e) => setBaseShippingFee(e.target.value.replace(/\D/g, ''))}
                    placeholder="예: 3,500"
                  />
                </div>
                <div>
                  <label className={mod.fieldLabel}>박스당 수량 (개)</label>
                  <input
                    className={mod.input}
                    type="text"
                    inputMode="numeric"
                    value={boxQty}
                    onChange={e => setBoxQty(e.target.value.replace(/\D/g, '') || '1')}
                    placeholder="예: 10"
                  />
                  <p className={mod.fieldHint}>박스 단위 배송비 계산 기준</p>
                </div>
              </div>

              {/* 낱개 구매 */}
              <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>
                  낱개 구매
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label className={mod.fieldLabel}>판매가 — 자동</label>
                    <input
                      className={mod.input}
                      value={priceNum > 0 ? formatKRW(priceNum) : '—'}
                      readOnly
                      style={{ background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}
                    />
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>정상가 대비 할인율 — 자동</label>
                    <input
                      className={mod.input}
                      value={
                        singleDiscountRate !== null
                          ? `${singleDiscountRate.toFixed(1)}% 할인`
                          : '정상가 미입력'
                      }
                      readOnly
                      style={{ background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}
                    />
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>배송비 고객 부담 시 마진</label>
                    <div
                      style={{
                        padding: '7px 10px',
                        border: `1px solid ${marginBadge(singleMargin).border}`,
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background: marginBadge(singleMargin).bg,
                        color: marginBadge(singleMargin).color,
                      }}
                    >
                      {marginBadge(singleMargin).label}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--ds-text-muted)', margin: '6px 0 0' }}>
                  {singleShippingCost > 0
                    ? `배송비 ${formatKRW(singleShippingCost)} 고객 부담 → 우리 마진에 영향 없음`
                    : '무료배송 적용'}
                </p>
              </div>

              {/* 무료배송 기준 */}
              <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>
                  무료배송 기준
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label className={mod.fieldLabel}>기준 수량 (개)</label>
                    <input
                      className={mod.input}
                      type="text"
                      inputMode="numeric"
                      value={freeShippingQty}
                      onChange={(e) => setFreeShippingQty(e.target.value.replace(/\D/g, ''))}
                      placeholder="예: 10"
                    />
                    {freeQtyNum > 1 && (
                      <p className={mod.fieldHint}>
                        1~{freeQtyNum - 1}개 → 배송비 {formatKRW(shippingFeeNum)} 자동 부과
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>최소 주문금액 — 자동</label>
                    <input
                      className={mod.input}
                      value={
                        priceNum > 0 && freeQtyNum > 0 ? `${formatKRW(priceNum * freeQtyNum)} 이상` : '—'
                      }
                      readOnly
                      style={{ background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}
                    />
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>우리 마진 (PG 3.3% 포함) — 자동</label>
                    <div
                      style={{
                        padding: '7px 10px',
                        border: `1px solid ${marginBadge(freeShippingMargin).border}`,
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background: marginBadge(freeShippingMargin).bg,
                        color: marginBadge(freeShippingMargin).color,
                      }}
                    >
                      {marginBadge(freeShippingMargin).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* 대량구매 */}
              <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>
                  대량구매 설정
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label className={mod.fieldLabel}>기준 수량 (개)</label>
                    <input
                      className={mod.input}
                      type="text"
                      inputMode="numeric"
                      value={bulkQty}
                      onChange={(e) => setBulkQty(e.target.value.replace(/\D/g, ''))}
                      placeholder="예: 30"
                    />
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>추가 할인율 (%)</label>
                    <input
                      className={mod.input}
                      type="text"
                      inputMode="numeric"
                      value={bulkDiscountRate}
                      onChange={(e) => setBulkDiscountRate(e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder="예: 3"
                    />
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>할인 적용가 — 자동</label>
                    <input
                      className={mod.input}
                      value={
                        bulkPrice > 0 && bulkRateNum > 0
                          ? `${formatKRW(bulkPrice)} (${bulkDiscountDisplay !== null ? bulkDiscountDisplay.toFixed(1) + '%↓' : ''})`
                          : '—'
                      }
                      readOnly
                      style={{ background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}
                    />
                    {bulkPrice > 0 && bulkQtyNum > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--ds-text-secondary)', margin: '4px 0 0' }}>
                        총 {bulkQtyNum}개 = {formatKRW(bulkPrice * bulkQtyNum)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={mod.fieldLabel}>우리 마진 (PG 3.3% 포함) — 자동</label>
                    <div
                      style={{
                        padding: '7px 10px',
                        border: `1px solid ${marginBadge(bulkMargin).border}`,
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        background: marginBadge(bulkMargin).bg,
                        color: marginBadge(bulkMargin).color,
                      }}
                    >
                      {marginBadge(bulkMargin).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* 마진 기준 범례 */}
              <div
                style={{
                  background: 'var(--ds-neutral-50)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>위험 (10% 이하)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>주의 (11~16%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>정상 (17% 이상)</span>
                </div>
              </div>

              {/* 묶음배송 그룹 */}
              <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginTop: 14 }}>
                <label className={mod.fieldLabel}>묶음배송 그룹 (선택)</label>
                <p className={mod.fieldHint}>같은 그룹 상품끼리 묶음배송 가능합니다</p>
                <div className={mod.shippingGroupToolbar}>
                  <select
                    className={`${mod.select} ${mod.shippingGroupSelect}`}
                    value={shippingGroupId}
                    onChange={(e) => setShippingGroupId(e.target.value)}
                    disabled={pending || shippingGroupActionBusy}
                  >
                    <option value="">선택 안 함</option>
                    {shippingGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={mod.btnGhost}
                    onClick={() => setShowAddShippingGroup((v) => !v)}
                    disabled={pending || shippingGroupActionBusy}
                  >
                    + 그룹 추가
                  </button>
                  <button
                    type="button"
                    className={mod.btnGhost}
                    onClick={openManageShippingModal}
                    disabled={pending || shippingGroupActionBusy}
                  >
                    관리
                  </button>
                </div>
                {showAddShippingGroup ? (
                  <div className={mod.shippingGroupInlineAdd}>
                    <input
                      className={mod.input}
                      value={newShippingGroupName}
                      onChange={(e) => setNewShippingGroupName(e.target.value)}
                      placeholder="그룹명"
                      disabled={shippingGroupActionBusy}
                    />
                    <button
                      type="button"
                      className={mod.btnGhost}
                      onClick={() => void submitNewShippingGroup()}
                      disabled={shippingGroupActionBusy}
                    >
                      추가
                    </button>
                    <button
                      type="button"
                      className={mod.btnGhost}
                      onClick={() => {
                        setShowAddShippingGroup(false)
                        setNewShippingGroupName('')
                      }}
                      disabled={shippingGroupActionBusy}
                    >
                      취소
                    </button>
                  </div>
                ) : null}
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
              <h2 className={mod.sectionTitle}>대표 썸네일 (목록·카드용)</h2>
              <div className={mod.specCallout}>
                <strong>권장 규격</strong>
                <ul className={mod.specList}>
                  <li>정사각형 이미지 · 1000×1000px 이상</li>
                  <li>JPG / PNG / WebP · 최대 8MB</li>
                  <li>상품 카드에서 정사각형으로 잘려 보입니다</li>
                </ul>
              </div>
              <p className={mod.hint}>
                목록·검색·카드용입니다. 아래 &quot;상세페이지&quot; 이미지와 역할이 다릅니다. 미리보기는 저장소에 반영된
                URL로 표시합니다.
              </p>
              <input
                ref={thumbFileRef}
                type="file"
                accept={ACCEPT_IMAGE}
                className={mod.visuallyHidden}
                onChange={onHeroFileInput}
              />
              <div
                className={`${mod.heroThumbDrop} ${thumbUploadState === 'uploading' ? mod.heroThumbDropBusy : ''} ${thumbUploadState === 'error' ? mod.heroThumbDropError : ''} ${pending ? mod.heroThumbDropDisabled : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={onHeroDrop}
                onClick={() => {
                  if (!pending && thumbUploadState !== 'uploading') thumbFileRef.current?.click()
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (!pending && thumbUploadState !== 'uploading') thumbFileRef.current?.click()
                  }
                }}
              >
                {thumb ? (
                  <img src={thumb} alt="" className={mod.heroThumbPreviewImg} key={thumb} />
                ) : (
                  <div className={mod.heroThumbPlaceholder}>
                    <span className={mod.heroThumbPlaceholderTitle}>이미지를 올려주세요</span>
                    <span className={mod.heroThumbPlaceholderSub}>
                      클릭 또는 드래그 · JPG, PNG, WebP · 파일당 최대{' '}
                      {Math.round(MAX_IMAGE_FILE_BYTES / (1024 * 1024))}MB
                    </span>
                  </div>
                )}
                {thumbUploadState === 'uploading' ? (
                  <div className={mod.progressIndeterminateWrap} aria-busy aria-label="업로드 중">
                    <div className={mod.progressIndeterminate} />
                  </div>
                ) : null}
              </div>
              {thumbUploadState === 'uploading' ? (
                <p className={mod.uploadStatusMuted}>업로드 중… 잠시만 기다려 주세요.</p>
              ) : null}
              {thumbUploadState === 'success' && thumbSource === 'upload' && thumb ? (
                <div className={mod.uploadOkBox}>
                  <span className={mod.uploadOkIcon} aria-hidden>
                    ✓
                  </span>
                  <div>
                    <div className={mod.uploadOkTitle}>업로드 완료</div>
                    {thumbFileMeta?.name ? (
                      <div className={mod.uploadMeta}>파일: {thumbFileMeta.name}</div>
                    ) : null}
                    <div className={mod.uploadMetaUrl} title={thumb}>
                      저장 URL: {thumb}
                    </div>
                  </div>
                </div>
              ) : null}
              {thumb && thumbSource === 'url' ? (
                <div className={mod.uploadInfoBox}>
                  외부 URL로 지정됨 · 미리보기는 아래 주소 기준입니다.
                  <div className={mod.uploadMetaUrl} title={thumb}>
                    {thumb}
                  </div>
                </div>
              ) : null}
              {thumbUploadState === 'error' ? (
                <div className={mod.uploadErrBox}>
                  <div className={mod.uploadErrTitle}>업로드 실패</div>
                  {uploadError ? <p className={mod.uploadErrBody}>{uploadError}</p> : null}
                  <button
                    type="button"
                    className={mod.btnGhost}
                    onClick={() => {
                      setThumbUploadState('idle')
                      setUploadError(null)
                      thumbFileRef.current?.click()
                    }}
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}
              <div className={mod.heroThumbActions}>
                <button
                  type="button"
                  className={mod.btnEmphasis}
                  disabled={pending || thumbUploadState === 'uploading'}
                  onClick={() => thumbFileRef.current?.click()}
                >
                  이미지 업로드
                </button>
                <button
                  type="button"
                  className={mod.btnMuted}
                  onClick={() => setShowThumbUrlField((v) => !v)}
                >
                  {showThumbUrlField ? 'URL 입력 닫기' : 'URL 입력 사용'}
                </button>
              </div>
              {showThumbUrlField ? (
                <div className={mod.thumbUrlSecondary}>
                  <div className={mod.label}>외부 이미지 URL (보조)</div>
                  <input
                    className={mod.input}
                    value={thumbnailUrl}
                    onChange={(e) => {
                      setThumbnailUrl(e.target.value)
                      setThumbSource('url')
                      setThumbFileMeta(null)
                      setThumbUploadState('idle')
                    }}
                    placeholder="CDN 등 외부 주소 붙여넣기"
                  />
                </div>
              ) : null}
            </div>

            <div
              className={mod.card}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (Array.from(e.dataTransfer.types).includes('Files')) {
                  e.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDrop={onDetailListDrop}
            >
              <h2 className={mod.sectionTitle}>상품 상세페이지 제작</h2>
              <p className={mod.detailCountLine}>
                <strong>
                  {detailRegisteredCount} / {MAX_DETAIL_IMAGES}장
                </strong>{' '}
                등록됨(업로드 중 포함) · 드래그(⋮⋮)로 순서 변경
              </p>
              <div className={mod.specCallout}>
                <strong>권장 규격</strong>
                <ul className={mod.specList}>
                  <li>세로형 가능 · 가로 1000px 이상 권장</li>
                  <li>JPG / PNG / WebP · 파일당 최대 8MB · 최대 {MAX_DETAIL_IMAGES}장</li>
                </ul>
              </div>
              <p className={mod.hint}>구매자가 상세페이지에서 보는 설득용 이미지입니다. 업로드 완료 시 저장소 URL이 블록에 반영됩니다.</p>

              <input
                ref={detailFilesRef}
                type="file"
                accept={ACCEPT_IMAGE}
                multiple
                className={mod.visuallyHidden}
                onChange={addDetailFilesFromPicker}
              />
              <input
                ref={retryDetailFileRef}
                type="file"
                accept={ACCEPT_IMAGE}
                className={mod.visuallyHidden}
                onChange={onRetryDetailFile}
              />

              <div className={mod.detailToolbar}>
                <button
                  type="button"
                  className={mod.btnEmphasis}
                  disabled={pending || detailBlocks.length >= MAX_DETAIL_IMAGES}
                  onClick={() => {
                    detailFilesRef.current?.click()
                  }}
                >
                  + 이미지 추가
                </button>
                <button
                  type="button"
                  className={mod.btnMuted}
                  disabled={pending || detailBlocks.length >= MAX_DETAIL_IMAGES}
                  onClick={addDetailUrlRow}
                >
                  URL 추가
                </button>
                <button
                  type="button"
                  className={mod.btnDangerQuiet}
                  disabled={pending || detailBlocks.length === 0}
                  onClick={clearAllDetailImages}
                >
                  전체 삭제
                </button>
              </div>

              <ProductDetailImageGenerator
                productName={productName}
                brandName={brandName}
                spec={spec}
                salePrice={(() => {
                  const fromDigits = Number(commercePrice.replace(/\D/g, ''))
                  return fromDigits || parseInt(commercePrice, 10) || 0
                })()}
                origin={origin}
                storageMethod={storageMethod}
                minOrderQty={Number(minOrderQty) || 1}
                packageUnit={packageUnit}
                usageDesc={usageDesc}
                allergen={allergen}
                ingredients={ingredients}
                aiStrengths={aiStrengths}
                aiUsage={aiUsage}
                aiSummary={aiSummary}
                thumbnailUrl={thumb || undefined}
                onGenerated={(file) => {
                  prependIncomingDetailFiles([file])
                }}
              />

              <div className={mod.detailBlockList}>
                {detailBlocks.length === 0 ? (
                  <p className={mod.hint} style={{ margin: 0 }}>
                    아직 상세 이미지가 없습니다. &quot;+ 이미지 추가&quot;를 누르면 이 영역에 카드가 나타납니다.
                  </p>
                ) : null}
                {detailBlocks.map((block, index) => (
                  <div
                    key={block.id}
                    className={mod.detailBlock}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (Array.from(e.dataTransfer.types).includes('Files')) {
                        e.dataTransfer.dropEffect = 'copy'
                      } else {
                        e.dataTransfer.dropEffect = 'move'
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (e.dataTransfer.files?.length) {
                        if (!pending) processIncomingDetailFiles(Array.from(e.dataTransfer.files))
                        return
                      }
                      const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
                      if (Number.isNaN(from)) return
                      reorderDetailBlocks(from, index)
                    }}
                  >
                    <div className={mod.detailBlockHeader}>
                      <span
                        className={mod.dragHandle}
                        draggable={
                          detailBlocks.length >= 2 && block.uploadStatus !== 'uploading'
                        }
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(index))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        aria-label="순서 변경"
                      >
                        ⋮⋮
                      </span>
                      <span className={mod.detailBlockOrder}>{index + 1}</span>
                      <button
                        type="button"
                        className={mod.btnGhost}
                        disabled={block.uploadStatus === 'uploading'}
                        onClick={() => removeDetailBlock(block.id)}
                      >
                        삭제
                      </button>
                    </div>
                    <div className={mod.detailBlockBody}>
                      <p className={mod.detailBlockStatusTag}>{detailBlockStatusLabel(block)}</p>
                      {block.uploadStatus === 'uploading' ? (
                        <div className={mod.detailBlockStatus}>
                          <div className={mod.detailSkeleton} aria-hidden />
                          <p className={mod.uploadStatusMuted}>업로드 중…</p>
                          <div className={mod.progressIndeterminateWrap} aria-busy>
                            <div className={mod.progressIndeterminate} />
                          </div>
                        </div>
                      ) : null}
                      {block.uploadStatus === 'error' ? (
                        <div className={mod.uploadErrBox}>
                          <div className={mod.uploadErrTitle}>업로드 실패</div>
                          {block.errorMessage ? (
                            <p className={mod.uploadErrBody}>{block.errorMessage}</p>
                          ) : null}
                          <button
                            type="button"
                            className={mod.btnGhost}
                            onClick={() => startRetryDetailUpload(block.id)}
                          >
                            다시 시도
                          </button>
                        </div>
                      ) : null}
                      {block.blockKind === 'url' &&
                      !block.url.trim() &&
                      block.uploadStatus === 'idle' ? (
                        <div>
                          <div className={mod.label}>외부 이미지 URL</div>
                          <input
                            className={mod.input}
                            value={block.url}
                            onChange={(e) => setDetailBlockUrl(block.id, e.target.value)}
                            placeholder="https://… (CDN 등)"
                          />
                        </div>
                      ) : null}
                      {block.url.trim() && block.uploadStatus !== 'uploading' ? (
                        <>
                          <img
                            src={block.url.trim()}
                            alt=""
                            className={mod.detailBlockPreview}
                            key={block.url.trim()}
                          />
                          {block.uploadStatus === 'done_upload' ? (
                            <div className={mod.uploadOkRow}>
                              <span className={mod.uploadOkIconSm} aria-hidden>
                                ✓
                              </span>
                              <span>업로드 완료</span>
                              {block.fileName ? (
                                <span className={mod.uploadMeta}> · {block.fileName}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {block.uploadStatus === 'url_linked' ? (
                            <div className={mod.uploadInfoRow}>외부 URL 연결됨 · 저장 시 그대로 저장됩니다</div>
                          ) : null}
                          <div className={mod.uploadMetaUrl} title={block.url.trim()}>
                            {block.url.trim()}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
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
                          key={thumb}
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
                  <div className={mod.phoneDetailShell}>
                    <div className={mod.phoneDetailInner}>
                      <p className={mod.phoneDetailEyebrow}>상세페이지 미리보기</p>
                      <div style={{ position: 'relative', width: '100%' }}>
                        {renderImageOverlays()}
                        {thumb ? (
                          <img src={thumb} alt="" className={mod.phoneDetailHero} key={thumb} />
                        ) : (
                          <div className={mod.phoneDetailHeroPlaceholder} aria-hidden>
                            {productNameInitial(productName)}
                          </div>
                        )}
                      </div>
                      <div className={mod.phoneDetailProduct}>
                        {brandName.trim() ? (
                          <div className={mod.phoneDetailBrand}>{brandName.trim()}</div>
                        ) : (
                          <PhBar width="36%" />
                        )}
                        {productName.trim() ? (
                          <h3 className={mod.phoneDetailTitle}>{productName.trim()}</h3>
                        ) : (
                          <PhBar width="92%" />
                        )}
                        {spec.trim() ? (
                          <p className={mod.phoneDetailSpec}>{spec.trim()}</p>
                        ) : (
                          <PhBar width="55%" />
                        )}
                        {previewPrice != null ? (
                          <div className={mod.phoneDetailPriceRow}>
                            <span className={mod.phoneDetailPriceLabel}>식식이가</span>
                            <span className={mod.phoneDetailPrice}>{formatKRW(previewPrice)}</span>
                            {savingsAmount != null && savingsAmount > 0 ? (
                              <span className={mod.phoneDetailSave}>{formatKRW(savingsAmount)} 절감</span>
                            ) : null}
                          </div>
                        ) : (
                          <PhBar width="72%" />
                        )}
                      </div>
                      <div className={mod.phoneDetailSection}>
                        <p className={mod.phoneDetailSectionTitle}>상세 이미지</p>
                        <div className={mod.phoneDetailImageStack}>
                          {detailUrlsForPreview.length > 0 ? (
                            detailUrlsForPreview.map((u, i) => (
                              <img
                                key={`${i}-${u.slice(0, 32)}`}
                                src={u}
                                alt=""
                                className={mod.phoneDetailStackImg}
                              />
                            ))
                          ) : (
                            <p className={mod.hint} style={{ margin: 0 }}>
                              상세 이미지를 추가하면 여기에 표시됩니다
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={mod.phoneDetailSection}>
                        <p className={mod.phoneDetailSectionTitle}>상품 정보</p>
                        {descPreview ? (
                          <p className={mod.phoneDetailDesc}>{listingDescription}</p>
                        ) : (
                          <p className={mod.hint} style={{ margin: 0 }}>
                            하단 설명 텍스트가 여기에 표시됩니다
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className={mod.previewFoot}>
                    대표 썸네일(카드용) → 상세 이미지(구매 설득) → 하단 설명 순입니다
                  </p>
                </>
              )}

              <div className={mod.card} style={{ marginTop: 12 }}>
                <h2 className={mod.sectionTitle}>노출 · 배송 · 메모</h2>
                <div className={mod.fieldStack}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#2b2b2b' }}>
                    <input
                      type="checkbox"
                      checked={discontinued ? false : storefrontPublished}
                      disabled={discontinued || pending}
                      onChange={(e) => setStorefrontPublished(e.target.checked)}
                    />
                    <span>
                      <strong>스토어에 공개</strong>
                      <span className={mod.hint} style={{ display: 'block', marginTop: 4 }}>
                        status=visible, is_visible=true
                      </span>
                    </span>
                  </label>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label className={mod.fieldLabel}>배송 유형</label>
                  <select
                    className={mod.select}
                    value={shippingType}
                    onChange={(e) => setShippingType(e.target.value as ListingShippingType)}
                    disabled={pending}
                  >
                    {LISTING_SHIPPING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {shippingTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label className={mod.fieldLabel}>관리자 메모</label>
                  <textarea
                    className={mod.input}
                    rows={3}
                    value={adminMemo}
                    onChange={(e) => setAdminMemo(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
              </div>
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
              className={`${mod.btn} ${mod.btnPrimary}`}
              disabled={pending || isSubmitting}
              onClick={() => saveListing()}
            >
              {pending || isSubmitting ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
