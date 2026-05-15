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
