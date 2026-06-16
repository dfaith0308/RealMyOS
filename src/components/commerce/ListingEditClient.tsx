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
    <div style={{ width: '100%', boxSizing: 'border-box' as const }}>

      {/* 토스트 */}
      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 3000, padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', background: toast.variant === 'success' ? '#15803d' : '#b91c1c', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
          {toast.text}
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 3px' }}>상품 수정</h1>
          <p style={{ fontSize: 12, color: 'var(--ds-text-secondary)', margin: 0 }}>이미지·재고·상품코드는 이 화면에서 다루지 않습니다</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={pending} style={{ padding: '8px 14px', border: '1px solid var(--ds-border-default)', borderRadius: 8, background: 'var(--ds-surface-panel)', fontSize: 13, color: 'var(--ds-text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
          <button type="submit" form="listing-edit-form" disabled={pending || !isDirty} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: pending || !isDirty ? '#9ca3af' : '#1f5d3a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: pending || !isDirty ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      <form id="listing-edit-form" onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 섹션 1: 기본 정보 */}
        <div style={{ background: 'var(--ds-surface-panel)', border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 14px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>기본 정보</p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>상품명 *</label>
                <input className={s.input} value={form.product_name} onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))} autoComplete="off" style={{ width: '100%', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>대분류 *</label>
                <select className={s.input} value={form.category_id} onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' as const }}>
                  <option value="" disabled>선택</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>소분류</label>
                <select className={s.input} value="" onChange={() => {}} style={{ width: '100%', boxSizing: 'border-box' as const }}>
                  <option value="">대분류 선택 후</option>
                  {categories.filter((c) => c.parent_id === form.category_id).map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.name}</option>
                  ))}
                </select>
              </div>
            </div>
        </div>

        {/* 섹션 2: 가격 */}
        <div style={{ background: 'var(--ds-surface-panel)', border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 14px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>가격</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>판매가 (원) *</label>
              <input className={s.input} inputMode="numeric" value={form.commerce_price} onChange={(e) => setForm((p) => ({ ...p, commerce_price: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' as const, borderColor: '#1f5d3a' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>시중 정상가 (원)</label>
              <input className={s.input} inputMode="numeric" placeholder="비워 두면 미사용" value={form.original_price} onChange={(e) => setForm((p) => ({ ...p, original_price: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' as const }} />
            </div>
          </div>
        </div>

        {/* 섹션 3: 배송 정책 */}
        <div style={{ background: 'var(--ds-surface-panel)', border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 14px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>배송 정책</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>공급가 (원) — 자동</label>
              <input className={s.input} value="—" readOnly style={{ width: '100%', boxSizing: 'border-box' as const, background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>기본 배송비 (원)</label>
              <input className={s.input} inputMode="numeric" value={form.base_shipping_fee ?? ''} onChange={(e) => setForm((p) => ({ ...p, base_shipping_fee: e.target.value }))} placeholder="예: 3500" style={{ width: '100%', boxSizing: 'border-box' as const }} />
            </div>
          </div>

          {/* 무료배송 기준 */}
          <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>무료배송 기준</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>기준 수량 (개)</label>
                <input className={s.input} inputMode="numeric" value={form.free_shipping_qty ?? ''} onChange={(e) => setForm((p) => ({ ...p, free_shipping_qty: e.target.value }))} placeholder="예: 10" style={{ width: '100%', boxSizing: 'border-box' as const }} />
                {Number(form.free_shipping_qty) > 1 && (
                  <p style={{ fontSize: 10, color: 'var(--ds-text-muted)', margin: '3px 0 0' }}>1~{Number(form.free_shipping_qty) - 1}개 → 배송비 자동 부과</p>
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>최소 주문금액 — 자동</label>
                <input className={s.input} value={Number(form.commerce_price) > 0 && Number(form.free_shipping_qty) > 0 ? `${(Number(form.commerce_price) * Number(form.free_shipping_qty)).toLocaleString()}원 이상` : '—'} readOnly style={{ width: '100%', boxSizing: 'border-box' as const, background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>우리 마진 (PG 3.3%) — 자동</label>
                <div style={{ padding: '8px 10px', border: '1px solid var(--ds-border-default)', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}>—</div>
              </div>
            </div>
          </div>

          {/* 대량구매 */}
          <div style={{ borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 14, marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', margin: '0 0 10px' }}>대량구매 설정</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>기준 수량 (개)</label>
                <input className={s.input} inputMode="numeric" value={form.bulk_qty ?? ''} onChange={(e) => setForm((p) => ({ ...p, bulk_qty: e.target.value }))} placeholder="예: 30" style={{ width: '100%', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>추가 할인율 (%)</label>
                <input className={s.input} inputMode="numeric" value={form.bulk_discount_rate ?? ''} onChange={(e) => setForm((p) => ({ ...p, bulk_discount_rate: e.target.value }))} placeholder="예: 3" style={{ width: '100%', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>할인 적용가 — 자동</label>
                <input className={s.input} value={Number(form.commerce_price) > 0 && Number(form.bulk_discount_rate) > 0 ? `${Math.round(Number(form.commerce_price) * (1 - Number(form.bulk_discount_rate) / 100)).toLocaleString()}원` : '—'} readOnly style={{ width: '100%', boxSizing: 'border-box' as const, background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>우리 마진 (PG 3.3%)</label>
                <div style={{ padding: '8px 10px', border: '1px solid var(--ds-border-default)', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--ds-neutral-50)', color: 'var(--ds-text-muted)' }}>—</div>
              </div>
            </div>
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--ds-neutral-50)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626' }} /><span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>위험 (10% 이하)</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706' }} /><span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>주의 (11~16%)</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d' }} /><span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>정상 (17% 이상)</span></div>
          </div>
        </div>

        {/* 섹션 4: 노출 설정 + 배송 유형 + 배지 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--ds-surface-panel)', border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 14px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>노출 설정</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: discontinued ? 'not-allowed' : 'pointer', padding: '10px 12px', border: '1px solid var(--ds-border-default)', borderRadius: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={discontinued ? false : form.storefront_published} disabled={discontinued || pending} onChange={(e) => setForm((p) => ({ ...p, storefront_published: e.target.checked }))} style={{ accentColor: '#1f5d3a', width: 16, height: 16 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-primary)', margin: 0 }}>스토어에 공개</p>
                <p style={{ fontSize: 11, color: 'var(--ds-text-secondary)', margin: 0 }}>status=visible, is_visible=true</p>
              </div>
            </label>
            <div>
              <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 6 }}>썸네일 배지 (최대 {MAX_THUMB_BADGES}개)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {THUMBNAIL_BADGE_OPTIONS.map((opt) => {
                  const checked = form.badge_labels.includes(opt.label)
                  const disabled = !checked && form.badge_labels.length >= MAX_THUMB_BADGES
                  return (
                    <label key={opt.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
                      <input type="checkbox" checked={checked} disabled={disabled || pending} onChange={() => setForm((p) => ({ ...p, badge_labels: toggleThumbBadge(p.badge_labels, opt.label) }))} />
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: checked ? opt.bg : 'var(--ds-neutral-50)', color: checked ? opt.color : 'var(--ds-text-secondary)', border: `1px solid ${checked ? opt.bg : 'var(--ds-border-default)'}` }}>{opt.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--ds-surface-panel)', border: '1px solid var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 14px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>배송 · 메모</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>배송 유형</label>
                <select className={s.input} value={form.shipping_type} onChange={(e) => setForm((p) => ({ ...p, shipping_type: e.target.value as ListingShippingType }))} style={{ width: '100%', boxSizing: 'border-box' as const }}>
                  {LISTING_SHIPPING_TYPES.map((t) => (<option key={t} value={t}>{shippingTypeLabel(t)}</option>))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>묶음배송 그룹</label>
                <select className={s.input} value={form.shipping_group_id} onChange={(e) => setForm((p) => ({ ...p, shipping_group_id: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' as const }}>
                  <option value="">없음</option>
                  {initial.shipping_group_id &&
                  !shippingGroups.some((x) => x.id === initial.shipping_group_id) ? (
                    <option value={initial.shipping_group_id}>
                      현재 지정된 그룹 (비활성·목록에 없음)
                    </option>
                  ) : null}
                  {shippingGroups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ds-text-secondary)', display: 'block', marginBottom: 4 }}>관리자 메모</label>
                <textarea className={s.input} rows={3} value={form.admin_memo} onChange={(e) => setForm((p) => ({ ...p, admin_memo: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const }} />
              </div>
            </div>
          </div>
        </div>

        {/* 섹션 5: 이미지 */}
        <div style={{ background: 'var(--ds-surface-panel)', border: '1px dashed var(--ds-border-default)', borderRadius: 12, padding: '18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-secondary)', margin: '0 0 6px', letterSpacing: '.06em', textTransform: 'uppercase' as const }}>이미지 (표시만)</p>
          <p style={{ fontSize: 11, color: 'var(--ds-text-muted)', margin: '0 0 12px' }}>이미지 수정은 다음 단계에서 지원합니다</p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--ds-text-secondary)', margin: '0 0 4px' }}>썸네일</p>
              {initial.thumbnail_url?.trim() ? (
                <img src={initial.thumbnail_url.trim()} alt="" width={100} height={100} style={{ objectFit: 'contain', borderRadius: 10, display: 'block', border: '1px solid var(--ds-border-default)' }} />
              ) : (
                <div style={{ width: 100, height: 100, borderRadius: 10, background: 'var(--ds-neutral-50)', border: '1px solid var(--ds-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--ds-text-muted)' }}>없음</div>
              )}
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--ds-text-secondary)', margin: '0 0 4px' }}>상세 이미지</p>
              {imgs.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>없음</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                  {imgs.map((u) => (<img key={u} src={u} alt="" width={80} height={80} style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid var(--ds-border-default)' }} />))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 에러 */}
        {fieldError && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
            {fieldError}
          </div>
        )}

        {/* 하단 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button type="button" onClick={onCancel} disabled={pending} style={{ padding: '10px 16px', border: '1px solid var(--ds-border-default)', borderRadius: 8, background: 'var(--ds-surface-panel)', fontSize: 13, color: 'var(--ds-text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
          <button type="submit" disabled={pending || !isDirty} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: pending || !isDirty ? '#9ca3af' : '#1f5d3a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: pending || !isDirty ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
