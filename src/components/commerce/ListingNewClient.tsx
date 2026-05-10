'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  createListingFull,
  getCategories,
  getSubCategories,
  uploadListingImage,
  type ListingShippingType,
  type PlatformCommerceCategory,
} from '@/actions/admin/commerce'
import { formatKRW } from '@/lib/calc'
import s from '@/app/(admin)/admin-shared.module.css'

function buildDisplayName(brand: string, productName: string, spec: string): string {
  const parts: string[] = []
  const b = brand.trim()
  const n = productName.trim()
  const sp = spec.trim()
  if (b) parts.push(b)
  if (n) parts.push(n)
  if (sp) parts.push(sp)
  return parts.join(' ') || '—'
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
const PLACEHOLDER = '#9ca3af'

export default function ListingNewClient() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [brandName, setBrandName] = useState('')
  const [productName, setProductName] = useState('')
  const [spec, setSpec] = useState('')
  const [imageTab, setImageTab] = useState<'url' | 'file'>('url')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)

  const [roots, setRoots] = useState<PlatformCommerceCategory[]>([])
  const [rootCategoryId, setRootCategoryId] = useState('')
  const [subCategories, setSubCategories] = useState<PlatformCommerceCategory[]>([])
  const [subCategoryId, setSubCategoryId] = useState('')

  const [commercePrice, setCommercePrice] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [shippingType, setShippingType] = useState<ListingShippingType>('free')
  const [adminMemo, setAdminMemo] = useState('')
  const [visibility, setVisibility] = useState<'draft' | 'visible'>('draft')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    let cancelled = false
    getCategories().then((res) => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error ?? '카테고리 조회 실패')
        setRoots([])
        return
      }
      setRoots(res.data?.categories ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!rootCategoryId) {
      setSubCategories([])
      setSubCategoryId('')
      return
    }
    let cancelled = false
    getSubCategories(rootCategoryId).then((res) => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error ?? '소분류 조회 실패')
        setSubCategories([])
        setSubCategoryId('')
        return
      }
      setSubCategories(res.data?.categories ?? [])
      setSubCategoryId('')
    })
    return () => {
      cancelled = true
    }
  }, [rootCategoryId])

  const effectiveCategoryId = subCategoryId || rootCategoryId

  const previewPrice = (() => {
    const n = parseInt(commercePrice.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const previewOriginal = (() => {
    const n = parseInt(originalPrice.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const previewSavings =
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
    const original_price =
      op != null && op > price ? op : null

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
        setImageTab('url')
        setRootCategoryId('')
        setSubCategoryId('')
        setSubCategories([])
        setCommercePrice('')
        setOriginalPrice('')
        setShippingType('free')
        setAdminMemo('')
        setVisibility('draft')
        setUploadError(null)
        showToast('저장되었습니다. 다음 상품을 입력하세요.')
        router.refresh()
        return
      }
      showToast(status === 'draft' ? '임시저장되었습니다.' : '공개되었습니다.')
      router.push('/admin/commerce/products')
    })
  }

  const shipCfg = shippingBadgeStyle(shippingType)
  const thumb = thumbnailUrl.trim()

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

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: '1 1 360px', minWidth: 280, maxWidth: '100%' }}>
          {error ? (
            <div
              className={s.panel}
              style={{
                marginBottom: 12,
                borderColor: 'var(--ds-border-danger, #fecaca)',
                color: 'var(--ds-text-danger, #b91c1c)',
              }}
            >
              {error}
            </div>
          ) : null}

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              기본 정보
            </div>
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              브랜드명 (선택)
            </label>
            <input
              className={s.input}
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="예: 해표, 백설, 오뚜기"
              style={{ width: '100%', marginBottom: 10 }}
            />
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              상품명 (필수)
            </label>
            <input
              className={s.input}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 업소용 식용유"
              style={{ width: '100%', marginBottom: 10 }}
            />
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              규격/용량 (선택)
            </label>
            <input
              className={s.input}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="예: 18L, 1kg × 5개"
              style={{ width: '100%', marginBottom: 6 }}
            />
            <p className={s.cellMutedSm} style={{ margin: 0, fontSize: 12 }}>
              저장 시 상품명은 브랜드·상품명·규격이 하나의 이름으로 합쳐집니다. Listing에는 규격 컬럼도 따로 저장됩니다.
            </p>
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              이미지
            </div>
            <div className={s.actionsRow} style={{ marginBottom: 8 }}>
              <button
                type="button"
                className={imageTab === 'url' ? s.primaryBtnSm : s.ghostBtn}
                onClick={() => setImageTab('url')}
              >
                URL
              </button>
              <button
                type="button"
                className={imageTab === 'file' ? s.primaryBtnSm : s.ghostBtn}
                onClick={() => setImageTab('file')}
              >
                파일 업로드
              </button>
            </div>
            {imageTab === 'url' ? (
              <input
                className={s.input}
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
                style={{ width: '100%' }}
              />
            ) : (
              <div>
                <input type="file" accept="image/*" disabled={uploadBusy || pending} onChange={onPickFile} />
                {uploadBusy ? <p className={s.cellMutedSm}>업로드 중…</p> : null}
                {uploadError ? (
                  <p style={{ color: 'var(--ds-text-danger, #b91c1c)', fontSize: 13, margin: '8px 0 0' }}>
                    {uploadError}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              카테고리
            </div>
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              대분류 (필수)
            </label>
            <select
              className={s.input}
              value={rootCategoryId}
              onChange={(e) => setRootCategoryId(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            >
              <option value="">카테고리 선택 (필수)</option>
              {roots.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {rootCategoryId ? (
              <>
                <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
                  소분류 (선택)
                </label>
                <select
                  className={s.input}
                  value={subCategoryId}
                  onChange={(e) => setSubCategoryId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">대분류만 사용</option>
                  {subCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {subCategories.length === 0 ? (
                  <p className={s.cellMutedSm} style={{ margin: '6px 0 0', fontSize: 12 }}>
                    등록된 소분류가 없습니다. 대분류만으로 저장됩니다.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              가격
            </div>
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              식식이 판매가 (원) (필수)
            </label>
            <input
              className={s.input}
              inputMode="numeric"
              value={commercePrice}
              onChange={(e) => setCommercePrice(e.target.value)}
              placeholder="예: 45000"
              style={{ width: '100%', marginBottom: 10 }}
            />
            <label className={s.cellMutedSm} style={{ display: 'block', marginBottom: 4 }}>
              시중 정상가 (원) (선택)
            </label>
            <input
              className={s.input}
              inputMode="numeric"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="예: 52000"
              style={{ width: '100%', marginBottom: 4 }}
            />
            <p className={s.cellMutedSm} style={{ margin: 0, fontSize: 12 }}>
              판매가보다 클 때만 절감액이 표시됩니다.
            </p>
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              배송 설정 (필수)
            </div>
            <select
              className={s.input}
              value={shippingType}
              onChange={(e) => setShippingType(e.target.value as ListingShippingType)}
              style={{ width: '100%' }}
            >
              <option value="free">무료배송</option>
              <option value="paid">유료배송</option>
              <option value="cold">냉장배송</option>
              <option value="same_day">오늘출고</option>
            </select>
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              운영 메모 (선택)
            </div>
            <textarea
              className={s.input}
              value={adminMemo}
              onChange={(e) => setAdminMemo(e.target.value)}
              placeholder="공급처, 주의사항, 묶음배송 조건 등 (구매자에게 노출 안 됨)"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div className={s.panel} style={{ marginBottom: 12 }}>
            <div className={s.cellStrong} style={{ marginBottom: 10 }}>
              공개 설정
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
              <input
                type="radio"
                name="vis"
                checked={visibility === 'draft'}
                onChange={() => setVisibility('draft')}
              />
              임시저장 (검토 후 공개) — 기본
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="vis"
                checked={visibility === 'visible'}
                onChange={() => setVisibility('visible')}
              />
              즉시 공개
            </label>
            <p className={s.cellMutedSm} style={{ margin: '8px 0 0', fontSize: 12 }}>
              아래 「임시저장」은 항상 초안,「저장 후 공개」「다음 상품 등록」은 항상 즉시 공개로 저장됩니다.
            </p>
          </div>

          <div className={s.actionsRow} style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={s.ghostBtn}
              disabled={pending}
              onClick={() => submitWithStatus('draft', false)}
            >
              임시저장
            </button>
            <button
              type="button"
              className={s.primaryBtn}
              disabled={pending}
              onClick={() => submitWithStatus('visible', false)}
            >
              저장 후 공개
            </button>
            <button
              type="button"
              className={s.primaryBtn}
              disabled={pending}
              onClick={() => submitWithStatus('visible', true)}
            >
              저장 후 다음 상품 등록
            </button>
            <Link href="/admin/commerce/products" className={s.ghostBtn}>
              취소
            </Link>
          </div>
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 260, maxWidth: '100%' }}>
          <div className={s.cellMutedSm} style={{ marginBottom: 8, fontSize: 12 }}>
            미리보기 (/buy 카드 형태)
          </div>
          <div
            style={{
              borderRadius: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              background: '#fff',
              overflow: 'hidden',
              maxWidth: 280,
            }}
          >
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
                  style={{ width: '100%', height: THUMB_H, objectFit: 'cover', display: 'block', background: '#f5f5f5' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: THUMB_H,
                    background: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: PLACEHOLDER,
                    fontSize: 13,
                  }}
                >
                  이미지 없음
                </div>
              )}
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {brandName.trim() ? (
                <div style={{ fontSize: 11, color: 'var(--color-primary, #0f766e)', fontWeight: 600 }}>
                  {brandName.trim()}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: PLACEHOLDER }}>브랜드</div>
              )}
              {productName.trim() ? (
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{productName.trim()}</div>
              ) : (
                <div style={{ fontSize: 13, color: PLACEHOLDER }}>상품명</div>
              )}
              {spec.trim() ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>{spec.trim()}</div>
              ) : (
                <div style={{ fontSize: 12, color: PLACEHOLDER }}>규격</div>
              )}
              <div style={{ fontSize: 11, color: '#888' }}>노출 이름</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                {buildDisplayName(brandName, productName, spec)}
              </div>
              {previewPrice != null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>식식이가</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{formatKRW(previewPrice)}</span>
                  {previewSavings != null && previewSavings > 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--color-primary, #0f766e)' }}>
                      {formatKRW(previewSavings)} 절감
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: PLACEHOLDER }}>절감액 (정상가 &gt; 판매가일 때)</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: PLACEHOLDER }}>가격</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
