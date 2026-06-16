'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type MouseEventHandler, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  updateListingFull,
  type ListingForEditData,
  type PlatformCommerceCategory,
  type ShippingGroupListItem,
} from '@/actions/admin/commerce'
import { LISTING_SHIPPING_TYPES, type ListingShippingType } from '@/lib/commerce-constants'
import { formatDigitsForInput, formatKRW } from '@/lib/calc'
import mod from './listing-new-client.module.css'
import s from '@/app/(admin)/admin-shared.module.css'

const MAX_THUMB_BADGES = 2

const THUMBNAIL_BADGE_OPTIONS: { label: string; bg: string; color: string }[] = [
  { label: '오늘출발', bg: '#ea580c', color: '#ffffff' },
  { label: '무료배송', bg: '#1f5d3a', color: '#ffffff' },
  { label: '추천상품', bg: '#1f5d3a', color: '#ffffff' },
  { label: '일시품절', bg: '#888888', color: '#ffffff' },
  { label: '가격네고', bg: '#2563eb', color: '#ffffff' },
  { label: 'BEST', bg: '#ea580c', color: '#ffffff' },
]

function toggleThumbBadge(current: string[], label: string): string[] {
  if (current.includes(label)) return current.filter((x) => x !== label)
  if (current.length >= MAX_THUMB_BADGES) return current
  return [...current, label]
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

type FormModel = {
  product_name: string
  category_id: string
  commerce_price: string
  original_price: string
  storefront_published: boolean
  shipping_type: ListingShippingType
  shipping_group_id: string
  badge_labels: string[]
  admin_memo: string
  base_shipping_fee: string
  free_shipping_qty: string
  bulk_qty: string
  bulk_discount_rate: string
}

function toFormModel(initial: ListingForEditData): FormModel {
  return {
    product_name: initial.product_name,
    category_id: initial.category_id ?? '',
    commerce_price: String(initial.commerce_price),
    original_price:
      initial.original_price != null && initial.original_price > 0
        ? String(initial.original_price)
        : '',
    storefront_published: listingStorefrontPublished(initial),
    shipping_type: (LISTING_SHIPPING_TYPES as readonly string[]).includes(initial.shipping_type)
      ? (initial.shipping_type as ListingShippingType)
      : 'free',
    shipping_group_id: initial.shipping_group_id ?? '',
    badge_labels: Array.isArray(initial.badge_labels) ? [...initial.badge_labels] : [],
    admin_memo: initial.admin_memo ?? '',
    base_shipping_fee:
      initial.base_shipping_fee != null && initial.base_shipping_fee > 0
        ? String(initial.base_shipping_fee)
        : '',
    free_shipping_qty:
      initial.free_shipping_qty != null && initial.free_shipping_qty > 0
        ? String(initial.free_shipping_qty)
        : '',
    bulk_qty: initial.bulk_qty != null && initial.bulk_qty > 0 ? String(initial.bulk_qty) : '',
    bulk_discount_rate:
      initial.bulk_discount_rate != null && initial.bulk_discount_rate > 0
        ? String(initial.bulk_discount_rate)
        : '',
  }
}

function serializeForm(f: FormModel): string {
  const op = f.original_price.trim()
  const badges = [...f.badge_labels].map((x) => x.trim()).filter(Boolean).sort()
  return JSON.stringify({
    product_name: f.product_name.trim(),
    category_id: f.category_id.trim(),
    commerce_price: f.commerce_price.trim(),
    original_price: op,
    storefront_published: f.storefront_published,
    shipping_type: f.shipping_type,
    shipping_group_id: f.shipping_group_id.trim(),
    badge_labels: badges,
    admin_memo: f.admin_memo.trim(),
    base_shipping_fee: f.base_shipping_fee.trim(),
    free_shipping_qty: f.free_shipping_qty.trim(),
    bulk_qty: f.bulk_qty.trim(),
    bulk_discount_rate: f.bulk_discount_rate.trim(),
  })
}

export default function ListingEditClient({
  initial,
  categories,
  shippingGroups,
}: {
  initial: ListingForEditData
  categories: PlatformCommerceCategory[]
  shippingGroups: ShippingGroupListItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormModel>(() => toFormModel(initial))
  const [baseline, setBaseline] = useState<string>(() => serializeForm(toFormModel(initial)))
  const [toast, setToast] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const isDirty = useMemo(() => serializeForm(form) !== baseline, [form, baseline])

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true
    return window.confirm('저장하지 않은 변경이 있습니다. 이동할까요?')
  }, [isDirty])

  const onNavigateList: MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (!confirmLeave()) e.preventDefault()
  }

  const discontinued = initial.status === 'discontinued'

  const PG_FEE_RATE = 0.033
  const costNum = 0
  const priceNum = parseInt(String(form.commerce_price).replace(/\D/g, ''), 10) || 0
  const originalPriceNum = parseInt(String(form.original_price).replace(/\D/g, ''), 10) || 0
  const shippingFeeNum = parseInt(form.base_shipping_fee.replace(/\D/g, ''), 10) || 0
  const freeQtyNum = parseInt(form.free_shipping_qty.replace(/\D/g, ''), 10) || 0
  const bulkQtyNum = parseInt(form.bulk_qty.replace(/\D/g, ''), 10) || 0
  const bulkRateNum = parseFloat(form.bulk_discount_rate) || 0

  const singleMargin =
    costNum > 0 && priceNum > 0
      ? ((priceNum * (1 - PG_FEE_RATE) - costNum) / (priceNum * (1 - PG_FEE_RATE))) * 100
      : null

  const freeShippingMargin =
    costNum > 0 && priceNum > 0 && freeQtyNum > 0
      ? ((priceNum * (1 - PG_FEE_RATE) * freeQtyNum - costNum * freeQtyNum - shippingFeeNum) /
          (priceNum * (1 - PG_FEE_RATE) * freeQtyNum)) *
        100
      : null

  const bulkPrice =
    priceNum > 0 && bulkRateNum > 0 ? Math.round(priceNum * (1 - bulkRateNum / 100)) : priceNum
  const bulkMargin =
    costNum > 0 && bulkPrice > 0 && bulkQtyNum > 0
      ? ((bulkPrice * (1 - PG_FEE_RATE) * bulkQtyNum - costNum * bulkQtyNum - shippingFeeNum) /
          (bulkPrice * (1 - PG_FEE_RATE) * bulkQtyNum)) *
        100
      : null

  const singleDiscountRate =
    originalPriceNum > 0 && priceNum > 0 && originalPriceNum > priceNum
      ? ((originalPriceNum - priceNum) / originalPriceNum) * 100
      : null
  const bulkDiscountDisplay =
    originalPriceNum > 0 && bulkPrice > 0 && originalPriceNum > bulkPrice
      ? ((originalPriceNum - bulkPrice) / originalPriceNum) * 100
      : null

  function validate(): string | null {
    if (!form.product_name.trim()) return '상품명을 입력해 주세요'
    if (!form.category_id.trim()) return '카테고리를 선택해 주세요'
    const price = parseInt(String(form.commerce_price).replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(price) || price <= 0) return '판매가는 1원 이상의 정수여야 합니다'
    const opRaw = form.original_price.trim()
    if (opRaw) {
      const op = parseInt(opRaw.replace(/[^\d]/g, ''), 10)
      if (!Number.isFinite(op) || op <= 0) return '정상가는 양의 정수이거나 비워 두세요'
      if (op <= price) return '정상가는 판매가보다 커야 합니다'
    }
    if (discontinued && form.storefront_published) {
      return '판매중단 상품은 공개할 수 없습니다'
    }
    if (!shippingFeeNum || shippingFeeNum <= 0) return '기본 배송비는 1원 이상의 정수여야 합니다'
    return null
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)
    const v = validate()
    if (v) {
      setFieldError(v)
      setToast({ text: v, variant: 'error' })
      return
    }
    const price = parseInt(String(form.commerce_price).replace(/[^\d]/g, ''), 10)
    const opRaw = form.original_price.trim()
    const original_price =
      opRaw.length > 0
        ? (() => {
            const op = parseInt(opRaw.replace(/[^\d]/g, ''), 10)
            return Number.isFinite(op) && op > price ? op : null
          })()
        : null

    const badge_labels = form.badge_labels.length > 0 ? form.badge_labels : null

    startTransition(async () => {
      const r = await updateListingFull({
        listing_id: initial.id,
        product_name: form.product_name.trim(),
        category_id: form.category_id.trim(),
        commerce_price: price,
        original_price,
        storefront_published: discontinued ? false : form.storefront_published,
        shipping_type: form.shipping_type,
        shipping_group_id: form.shipping_group_id.trim() || null,
        badge_labels,
        admin_memo: form.admin_memo.trim() || null,
        base_shipping_fee: shippingFeeNum,
        free_shipping_qty: freeQtyNum > 0 ? freeQtyNum : null,
        bulk_qty: bulkQtyNum > 0 ? bulkQtyNum : null,
        bulk_discount_rate: bulkRateNum > 0 ? bulkRateNum : null,
      })
      if (!r.success) {
        const msg = r.error ?? '저장에 실패했습니다'
        setFieldError(msg)
        setToast({ text: msg, variant: 'error' })
        return
      }
      setToast({ text: '저장되었습니다', variant: 'success' })
      setBaseline(serializeForm(form))
      router.push('/admin/commerce/products')
    })
  }

  function onCancel() {
    if (!confirmLeave()) return
    router.push('/admin/commerce/products')
  }

  const imgs = Array.isArray(initial.image_urls) ? initial.image_urls.filter((u) => String(u).trim()) : []

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <header className={s.headerBetween} style={{ marginBottom: 20 }}>
        <div>
          <h2 className={s.title} style={{ fontSize: 22 }}>
            상품 수정
          </h2>
          <p className={s.subtitle}>운영용 빠른 수정 — 이미지·재고·상품코드는 이 화면에서 다루지 않습니다.</p>
        </div>
        <Link href="/admin/commerce/products" className={s.ghostBtn} onClick={onNavigateList}>
          목록으로
        </Link>
      </header>

      <form className={s.panel} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>상품명 (`products.name`)</span>
          <input
            className={s.input}
            value={form.product_name}
            onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))}
            autoComplete="off"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>카테고리 (대분류)</span>
          <select
            className={s.input}
            value={form.category_id}
            onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
          >
            <option value="" disabled>
              선택
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>판매가 (원, 정수)</span>
            <input
              className={s.input}
              inputMode="numeric"
              value={form.commerce_price}
              onChange={(e) => setForm((p) => ({ ...p, commerce_price: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>정상가 / 시중가 (선택)</span>
            <input
              className={s.input}
              inputMode="numeric"
              placeholder="비워 두면 미사용"
              value={form.original_price}
              onChange={(e) => setForm((p) => ({ ...p, original_price: e.target.value }))}
            />
          </label>
        </div>

        <fieldset style={{ border: '1px solid var(--ds-border-default, #e5e7eb)', borderRadius: 10, padding: 12 }}>
          <legend style={{ fontSize: 13, fontWeight: 600 }}>스토어 노출</legend>
          <p className={s.cellMutedSm} style={{ margin: '0 0 8px' }}>
            공개: <code>status=visible</code> 이고 <code>is_visible=true</code> — 목록·스토어와 동일합니다. 비공개 전환은
            노출 중인 상품을 <code>hidden</code>으로 둡니다.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: discontinued ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={discontinued ? false : form.storefront_published}
              disabled={discontinued || pending}
              onChange={(e) => setForm((p) => ({ ...p, storefront_published: e.target.checked }))}
            />
            <span>스토어에 공개 (판매 노출)</span>
          </label>
          {discontinued ? <p className={s.cellMutedSm}>판매중단 상품은 공개 설정을 바꿀 수 없습니다.</p> : null}
        </fieldset>

        <div className={mod.card}>
          <p className={mod.sectionLabel}>배송 정책</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label className={mod.fieldLabel}>공급가 (원) — 자동</label>
              <input
                className={mod.input}
                value="—"
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
                value={formatDigitsForInput(form.base_shipping_fee)}
                onChange={(e) => setForm((p) => ({ ...p, base_shipping_fee: e.target.value.replace(/\D/g, '') }))}
                placeholder="예: 3,500"
              />
            </div>
          </div>

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
              낱개 구매 시 배송비는 고객 부담 → 우리 마진에 영향 없음
            </p>
          </div>

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
                  value={form.free_shipping_qty}
                  onChange={(e) => setForm((p) => ({ ...p, free_shipping_qty: e.target.value.replace(/\D/g, '') }))}
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
                  value={form.bulk_qty}
                  onChange={(e) => setForm((p) => ({ ...p, bulk_qty: e.target.value.replace(/\D/g, '') }))}
                  placeholder="예: 30"
                />
              </div>
              <div>
                <label className={mod.fieldLabel}>추가 할인율 (%)</label>
                <input
                  className={mod.input}
                  type="text"
                  inputMode="numeric"
                  value={form.bulk_discount_rate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, bulk_discount_rate: e.target.value.replace(/[^\d.]/g, '') }))
                  }
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
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>배송 유형</span>
          <select
            className={s.input}
            value={form.shipping_type}
            onChange={(e) =>
              setForm((p) => ({ ...p, shipping_type: e.target.value as ListingShippingType }))
            }
          >
            {LISTING_SHIPPING_TYPES.map((t) => (
              <option key={t} value={t}>
                {shippingTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>묶음배송 그룹 (선택)</span>
          <select
            className={s.input}
            value={form.shipping_group_id}
            onChange={(e) => setForm((p) => ({ ...p, shipping_group_id: e.target.value }))}
          >
            <option value="">없음</option>
            {initial.shipping_group_id &&
            !shippingGroups.some((x) => x.id === initial.shipping_group_id) ? (
              <option value={initial.shipping_group_id}>
                현재 지정된 그룹 (비활성·목록에 없음 — 저장 시 다른 그룹을 선택하세요)
              </option>
            ) : null}
            {shippingGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>썸네일 뱃지 (최대 {MAX_THUMB_BADGES}개)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {THUMBNAIL_BADGE_OPTIONS.map((opt) => {
              const checked = form.badge_labels.includes(opt.label)
              const disabled = !checked && form.badge_labels.length >= MAX_THUMB_BADGES
              return (
                <label
                  key={opt.label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.45 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || pending}
                    onChange={() => setForm((p) => ({ ...p, badge_labels: toggleThumbBadge(p.badge_labels, opt.label) }))}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: opt.bg,
                      color: opt.color,
                    }}
                  >
                    {opt.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>관리자 메모</span>
          <textarea
            className={s.input}
            rows={3}
            value={form.admin_memo}
            onChange={(e) => setForm((p) => ({ ...p, admin_memo: e.target.value }))}
          />
        </label>

        <div
          className={s.panel}
          style={{ background: 'var(--ds-surface-muted, #f8fafc)', borderStyle: 'dashed' }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>이미지 (표시만)</div>
          <p className={s.cellMutedSm} style={{ margin: '0 0 12px' }}>
            이미지 수정은 다음 단계에서 지원합니다. 현재 등록된 썸네일·상세 이미지 URL만 확인할 수 있습니다.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div className={s.cellMutedSm} style={{ marginBottom: 4 }}>
                썸네일
              </div>
              {initial.thumbnail_url?.trim() ? (
                <img
                  src={initial.thumbnail_url.trim()}
                  alt=""
                  width={120}
                  height={120}
                  style={{ objectFit: 'cover', borderRadius: 10, display: 'block', border: '1px solid #e5e7eb' }}
                />
              ) : (
                <span className={s.cellMutedSm}>없음</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className={s.cellMutedSm} style={{ marginBottom: 4 }}>
                상세 이미지
              </div>
              {imgs.length === 0 ? (
                <span className={s.cellMutedSm}>없음</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {imgs.map((u) => (
                    <img
                      key={u}
                      src={u}
                      alt=""
                      width={72}
                      height={72}
                      style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {fieldError ? (
          <div
            className={s.panel}
            style={{ borderColor: 'var(--ds-border-danger, #fecaca)', color: 'var(--ds-text-danger, #b91c1c)' }}
          >
            {fieldError}
          </div>
        ) : null}

        <div className={s.actionsRow}>
          <button type="button" className={s.ghostBtn} disabled={pending} onClick={onCancel}>
            취소
          </button>
          <button type="submit" className={s.primaryBtn} disabled={pending || !isDirty}>
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 3000,
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: toast.variant === 'success' ? '#15803d' : '#b91c1c',
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
          }}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  )
}
