'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import {
  DETAIL_FIELDS,
  LINK_OVERRIDE_KEYS,
  normalizeFieldValue,
  resolveDetailFields,
  type DetailFieldKey,
  type DetailValues,
  type ListingOptionColumns,
  type ResolvedField,
} from '@/lib/detail-template/fields'
import {
  ORDER_GUIDE_SETTING_KEYS,
  parseCutoffTime,
  parseOrderGuideSettings,
  parseWeekdays,
  type OrderGuideSettings,
} from '@/lib/detail-template/system'

/**
 * 관리자 — 상세페이지 템플릿(상품) · 옵션 연결 · 옵션별 칸 · 플랫폼 발주 안내.
 *
 * 관례: requireAdmin(세션) → createSupabaseAdmin → 쓰기 → admin_logs (ingredient-proxy.ts 와 같은 순서).
 * 콘텐츠 편집은 되돌릴 회계 효과가 없어, commerce.ts 의 listing 편집처럼 "쓰기 후 로그"로 둔다.
 * 로그가 실패하면 오류를 돌려준다(조용히 넘어가지 않는다).
 */

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'
const MIGRATION_HINT = '상세페이지 템플릿 마이그레이션(20260915110000)이 아직 적용되지 않았습니다'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TEMPLATE_COLUMNS = ['id', 'title', ...DETAIL_FIELDS.map((f) => f.key), 'created_at', 'updated_at', 'archived_at'].join(', ')
const LINK_COLUMNS = ['listing_id', 'template_id', 'sort_order', ...LINK_OVERRIDE_KEYS, 'updated_at'].join(', ')

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx, admin: await createSupabaseAdmin() }
}

function schemaError(message: string | undefined): string {
  const m = String(message ?? '')
  if (/commerce_detail_templates|commerce_listing_detail_links/.test(m) && /does not exist|could not find|schema cache/i.test(m)) {
    return MIGRATION_HINT
  }
  return m || '처리 실패'
}

async function log(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  input: {
    admin_id: string
    action_type: string
    target_table: string
    target_id: string | null
    old_value?: unknown
    new_value?: unknown
  },
): Promise<string | null> {
  const { error } = await admin.from('admin_logs').insert({
    admin_tenant_id: PLATFORM_OWNER_TENANT,
    admin_id: input.admin_id,
    tenant_id: null,
    action_type: input.action_type,
    target_table: input.target_table,
    target_id: input.target_id,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  return error ? `admin_logs 기록 실패: ${error.message}` : null
}

// ── 목록 ─────────────────────────────────────────────────────────────────────────

export type DetailTemplateListRow = {
  id: string
  title: string
  option_count: number
  filled_count: number
  updated_at: string
  archived_at: string | null
}

export async function listDetailTemplates(opts?: { includeArchived?: boolean }): Promise<
  ActionResult<{ templates: DetailTemplateListRow[] }>
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  let q = auth.admin.from('commerce_detail_templates').select(TEMPLATE_COLUMNS).order('updated_at', { ascending: false })
  if (!opts?.includeArchived) q = q.is('archived_at', null)
  const [tRes, lRes] = await Promise.all([q, auth.admin.from('commerce_listing_detail_links').select('template_id')])
  if (tRes.error) return { success: false, error: schemaError(tRes.error.message) }
  if (lRes.error) return { success: false, error: schemaError(lRes.error.message) }

  const counts = new Map<string, number>()
  for (const l of (lRes.data ?? []) as { template_id: string }[]) {
    counts.set(l.template_id, (counts.get(l.template_id) ?? 0) + 1)
  }

  const templates = ((tRes.data ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    id: String(t.id),
    title: String(t.title ?? ''),
    option_count: counts.get(String(t.id)) ?? 0,
    filled_count: DETAIL_FIELDS.filter((f) => t[f.key] != null).length,
    updated_at: String(t.updated_at ?? ''),
    archived_at: (t.archived_at as string | null) ?? null,
  }))
  return { success: true, data: { templates } }
}

// ── 상세 ─────────────────────────────────────────────────────────────────────────

export type DetailOptionRow = {
  listing_id: string
  name: string
  spec: string | null
  commerce_price: number
  status: string
  sort_order: number
  overrides: DetailValues
  listing_columns: ListingOptionColumns
  /** 칸별로 무엇이 보일지(옵션 값/상품 값/숨김) — 판정은 resolveDetailFields 한 곳 */
  resolved: Record<DetailFieldKey, ResolvedField>
}

export type DetailTemplateDetail = {
  id: string
  title: string
  values: DetailValues
  archived_at: string | null
  options: DetailOptionRow[]
}

function pickValues(row: Record<string, unknown>, keys: readonly string[]): DetailValues {
  const out: DetailValues = {}
  for (const k of keys) out[k as DetailFieldKey] = (row[k] ?? null) as DetailValues[DetailFieldKey]
  return out
}

export async function getDetailTemplate(id: string): Promise<ActionResult<DetailTemplateDetail>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: '템플릿 ID가 올바르지 않습니다' }

  const [tRes, lRes] = await Promise.all([
    auth.admin.from('commerce_detail_templates').select(TEMPLATE_COLUMNS).eq('id', id).maybeSingle(),
    auth.admin.from('commerce_listing_detail_links').select(LINK_COLUMNS).eq('template_id', id).order('sort_order'),
  ])
  if (tRes.error) return { success: false, error: schemaError(tRes.error.message) }
  if (!tRes.data) return { success: false, error: '템플릿을 찾을 수 없습니다' }
  if (lRes.error) return { success: false, error: schemaError(lRes.error.message) }

  const t = tRes.data as unknown as Record<string, unknown>
  const values = pickValues(t, DETAIL_FIELDS.map((f) => f.key))
  const links = (lRes.data ?? []) as unknown as Record<string, unknown>[]

  const listingIds = links.map((l) => String(l.listing_id))
  const listingMap = new Map<string, Record<string, unknown>>()
  if (listingIds.length) {
    const { data, error } = await auth.admin
      .from('commerce_product_listings')
      .select('id, spec, commerce_price, status, image_urls, origin, allergen, storage_method, ingredients, brand_name, products ( name )')
      .in('id', listingIds)
    if (error) return { success: false, error: error.message }
    for (const r of (data ?? []) as Record<string, unknown>[]) listingMap.set(String(r.id), r)
  }

  const options: DetailOptionRow[] = links.map((l) => {
    const lr = listingMap.get(String(l.listing_id)) ?? {}
    const prod = Array.isArray(lr.products) ? (lr.products[0] as Record<string, unknown> | undefined) : (lr.products as Record<string, unknown> | undefined)
    const overrides = pickValues(l, LINK_OVERRIDE_KEYS)
    const listing_columns: ListingOptionColumns = {
      image_urls: (lr.image_urls as string[] | null) ?? null,
      origin: (lr.origin as string | null) ?? null,
      allergen: (lr.allergen as string | null) ?? null,
      storage_method: (lr.storage_method as string | null) ?? null,
      ingredients: (lr.ingredients as string | null) ?? null,
    }
    return {
      listing_id: String(l.listing_id),
      name: [lr.brand_name, prod?.name].filter(Boolean).join(' ') || '(상품명 없음)',
      spec: (lr.spec as string | null) ?? null,
      commerce_price: Number(lr.commerce_price ?? 0),
      status: String(lr.status ?? ''),
      sort_order: Number(l.sort_order ?? 0),
      overrides,
      listing_columns,
      resolved: resolveDetailFields(values, overrides, listing_columns),
    }
  })

  return {
    success: true,
    data: { id: String(t.id), title: String(t.title ?? ''), values, archived_at: (t.archived_at as string | null) ?? null, options },
  }
}

// ── 쓰기: 템플릿 ─────────────────────────────────────────────────────────────────

export async function createDetailTemplate(title: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const t = String(title ?? '').trim()
  if (!t) return { success: false, error: '관리용 이름을 입력해 주세요' }
  if (t.length > 80) return { success: false, error: '관리용 이름은 80자 이하입니다' }

  const { data, error } = await auth.admin
    .from('commerce_detail_templates')
    .insert({ title: t, created_by: auth.ctx.user_id, updated_by: auth.ctx.user_id })
    .select('id')
    .single()
  if (error) return { success: false, error: schemaError(error.message) }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'detail_template_created',
    target_table: 'commerce_detail_templates',
    target_id: data.id,
    new_value: { title: t },
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath('/admin/commerce/detail-templates')
  return { success: true, data: { id: data.id } }
}

/** 칸 단위 저장. patch 에 없는 칸은 건드리지 않는다. 빈 값은 NULL 로 저장된다 */
export async function updateDetailTemplate(
  id: string,
  patch: { title?: string } & Partial<Record<DetailFieldKey, unknown>>,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: '템플릿 ID가 올바르지 않습니다' }

  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const t = String(patch.title ?? '').trim()
    if (!t || t.length > 80) return { success: false, error: '관리용 이름은 1~80자입니다' }
    row.title = t
  }
  for (const def of DETAIL_FIELDS) {
    if (!(def.key in patch)) continue
    const n = normalizeFieldValue(def, patch[def.key])
    if (n.error) return { success: false, error: n.error }
    row[def.key] = n.value
  }
  if (Object.keys(row).length === 0) return { success: true }

  const { data: before, error: bErr } = await auth.admin
    .from('commerce_detail_templates')
    .select(Object.keys(row).join(', '))
    .eq('id', id)
    .maybeSingle()
  if (bErr) return { success: false, error: schemaError(bErr.message) }
  if (!before) return { success: false, error: '템플릿을 찾을 수 없습니다' }

  const { error } = await auth.admin
    .from('commerce_detail_templates')
    .update({ ...row, updated_by: auth.ctx.user_id, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false, error: schemaError(error.message) }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'detail_template_updated',
    target_table: 'commerce_detail_templates',
    target_id: id,
    old_value: before,
    new_value: row,
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath(`/admin/commerce/detail-templates/${id}`)
  return { success: true }
}

/** 보관 / 보관 해제 — 삭제하지 않는다 (원칙 6) */
export async function setDetailTemplateArchived(id: string, archived: boolean): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: '템플릿 ID가 올바르지 않습니다' }

  const archived_at = archived ? new Date().toISOString() : null
  const { error } = await auth.admin
    .from('commerce_detail_templates')
    .update({ archived_at, updated_by: auth.ctx.user_id, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false, error: schemaError(error.message) }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: archived ? 'detail_template_archived' : 'detail_template_unarchived',
    target_table: 'commerce_detail_templates',
    target_id: id,
    new_value: { archived_at },
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath('/admin/commerce/detail-templates')
  revalidatePath(`/admin/commerce/detail-templates/${id}`)
  return { success: true }
}

// ── 쓰기: 옵션 연결 ──────────────────────────────────────────────────────────────

export type ListingPickRow = {
  id: string
  name: string
  spec: string | null
  commerce_price: number
  status: string
  linked_template_id: string | null
}

/** 연결할 listing 검색 — 상품명(products.name)·브랜드·규격 기준 */
export async function searchListingsForDetailTemplate(query: string): Promise<ActionResult<{ rows: ListingPickRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const qv = String(query ?? '').trim()
  if (qv.length < 1) return { success: true, data: { rows: [] } }
  // PostgREST or() 문법을 깨는 문자는 빼고 찾는다
  const safe = qv.replace(/[,()*%\\]/g, ' ').trim().slice(0, 40)
  if (!safe) return { success: true, data: { rows: [] } }

  const [byProduct, byListing] = await Promise.all([
    auth.admin
      .from('commerce_product_listings')
      .select('id, spec, commerce_price, status, brand_name, products!inner ( name )')
      .is('deleted_at', null)
      .ilike('products.name', `%${safe}%`)
      .limit(30),
    auth.admin
      .from('commerce_product_listings')
      .select('id, spec, commerce_price, status, brand_name, products ( name )')
      .is('deleted_at', null)
      .or(`brand_name.ilike.%${safe}%,spec.ilike.%${safe}%`)
      .limit(30),
  ])
  if (byProduct.error) return { success: false, error: byProduct.error.message }
  if (byListing.error) return { success: false, error: byListing.error.message }

  const merged = new Map<string, Record<string, unknown>>()
  for (const r of [...(byProduct.data ?? []), ...(byListing.data ?? [])] as Record<string, unknown>[]) {
    merged.set(String(r.id), r)
  }
  const ids = [...merged.keys()]
  const linkMap = new Map<string, string>()
  if (ids.length) {
    const { data, error } = await auth.admin.from('commerce_listing_detail_links').select('listing_id, template_id').in('listing_id', ids)
    if (error) return { success: false, error: schemaError(error.message) }
    for (const l of (data ?? []) as { listing_id: string; template_id: string }[]) linkMap.set(l.listing_id, l.template_id)
  }

  const rows = [...merged.values()].map((r) => {
    const prod = Array.isArray(r.products) ? (r.products[0] as Record<string, unknown> | undefined) : (r.products as Record<string, unknown> | undefined)
    return {
      id: String(r.id),
      name: [r.brand_name, prod?.name].filter(Boolean).join(' ') || '(상품명 없음)',
      spec: (r.spec as string | null) ?? null,
      commerce_price: Number(r.commerce_price ?? 0),
      status: String(r.status ?? ''),
      linked_template_id: linkMap.get(String(r.id)) ?? null,
    }
  })
  return { success: true, data: { rows } }
}

export async function linkListingToDetailTemplate(templateId: string, listingId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(templateId) || !UUID_RE.test(listingId)) return { success: false, error: 'ID가 올바르지 않습니다' }

  const [tRes, lRes, exRes, orderRes] = await Promise.all([
    auth.admin.from('commerce_detail_templates').select('id, archived_at').eq('id', templateId).maybeSingle(),
    auth.admin.from('commerce_product_listings').select('id').eq('id', listingId).is('deleted_at', null).maybeSingle(),
    auth.admin.from('commerce_listing_detail_links').select('template_id').eq('listing_id', listingId).maybeSingle(),
    auth.admin.from('commerce_listing_detail_links').select('sort_order').eq('template_id', templateId).order('sort_order', { ascending: false }).limit(1),
  ])
  if (tRes.error) return { success: false, error: schemaError(tRes.error.message) }
  if (!tRes.data) return { success: false, error: '템플릿을 찾을 수 없습니다' }
  if (tRes.data.archived_at) return { success: false, error: '보관된 템플릿에는 연결할 수 없습니다' }
  if (lRes.error) return { success: false, error: lRes.error.message }
  if (!lRes.data) return { success: false, error: '상품(listing)을 찾을 수 없습니다' }
  if (exRes.error) return { success: false, error: schemaError(exRes.error.message) }
  if (exRes.data) {
    return {
      success: false,
      error:
        exRes.data.template_id === templateId
          ? '이미 이 템플릿에 연결된 상품입니다'
          : '다른 템플릿에 연결된 상품입니다. 그 템플릿에서 먼저 연결을 해제해 주세요',
    }
  }
  const nextOrder = Number(((orderRes.data ?? []) as { sort_order: number }[])[0]?.sort_order ?? -1) + 1

  const { error } = await auth.admin.from('commerce_listing_detail_links').insert({
    listing_id: listingId,
    template_id: templateId,
    sort_order: nextOrder,
    created_by: auth.ctx.user_id,
    updated_by: auth.ctx.user_id,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') return { success: false, error: '이미 다른 템플릿에 연결된 상품입니다' }
    return { success: false, error: schemaError(error.message) }
  }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'detail_template_listing_linked',
    target_table: 'commerce_listing_detail_links',
    target_id: listingId,
    new_value: { template_id: templateId, listing_id: listingId, sort_order: nextOrder },
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath(`/admin/commerce/detail-templates/${templateId}`)
  return { success: true }
}

/**
 * 연결 해제. 링크 행에는 옵션 전용 값이 들어 있으므로, 지우기 전에 행 전체를 admin_logs.old_value 에 남긴다
 * (다시 연결할 때 사람이 로그에서 되살릴 수 있게). 해제한 listing 은 기존 상세 화면으로 돌아간다.
 */
export async function unlinkListingFromDetailTemplate(listingId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(listingId)) return { success: false, error: 'ID가 올바르지 않습니다' }

  const { data: before, error: bErr } = await auth.admin
    .from('commerce_listing_detail_links')
    .select(LINK_COLUMNS)
    .eq('listing_id', listingId)
    .maybeSingle()
  if (bErr) return { success: false, error: schemaError(bErr.message) }
  if (!before) return { success: true }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'detail_template_listing_unlinked',
    target_table: 'commerce_listing_detail_links',
    target_id: listingId,
    old_value: before,
  })
  // 되살릴 근거를 남기지 못했으면 지우지 않는다
  if (logErr) return { success: false, error: logErr }

  const { error } = await auth.admin.from('commerce_listing_detail_links').delete().eq('listing_id', listingId)
  if (error) return { success: false, error: schemaError(error.message) }

  const templateId = String((before as unknown as Record<string, unknown>).template_id ?? '')
  revalidatePath(`/admin/commerce/detail-templates/${templateId}`)
  return { success: true }
}

/** 옵션 칸 저장. 값을 비우면 NULL → 상품(템플릿) 값으로 돌아간다 */
export async function updateListingDetailOverride(
  listingId: string,
  patch: Partial<Record<DetailFieldKey, unknown>> & { sort_order?: number },
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(listingId)) return { success: false, error: 'ID가 올바르지 않습니다' }

  const row: Record<string, unknown> = {}
  for (const def of DETAIL_FIELDS) {
    if (!(def.key in patch)) continue
    if (def.optionSource !== 'link') {
      return { success: false, error: `${def.label}: 옵션 값은 상품 등록(수정) 화면의 해당 칸을 씁니다` }
    }
    const n = normalizeFieldValue(def, patch[def.key])
    if (n.error) return { success: false, error: n.error }
    row[def.key] = n.value
  }
  if (patch.sort_order !== undefined) {
    const so = Number(patch.sort_order)
    if (!Number.isInteger(so) || so < 0 || so > 9999) return { success: false, error: '순서는 0~9999 정수입니다' }
    row.sort_order = so
  }
  if (Object.keys(row).length === 0) return { success: true }

  const { data: before, error: bErr } = await auth.admin
    .from('commerce_listing_detail_links')
    .select(['template_id', ...Object.keys(row)].join(', '))
    .eq('listing_id', listingId)
    .maybeSingle()
  if (bErr) return { success: false, error: schemaError(bErr.message) }
  if (!before) return { success: false, error: '템플릿에 연결되지 않은 상품입니다' }

  const { error } = await auth.admin
    .from('commerce_listing_detail_links')
    .update({ ...row, updated_by: auth.ctx.user_id, updated_at: new Date().toISOString() })
    .eq('listing_id', listingId)
  if (error) return { success: false, error: schemaError(error.message) }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'detail_template_option_updated',
    target_table: 'commerce_listing_detail_links',
    target_id: listingId,
    old_value: before,
    new_value: row,
  })
  if (logErr) return { success: false, error: logErr }

  const templateId = String((before as unknown as Record<string, unknown>).template_id ?? '')
  revalidatePath(`/admin/commerce/detail-templates/${templateId}`)
  return { success: true }
}

/** 상품 수정 화면용 — 이 listing 이 연결된 템플릿 */
export async function getListingDetailTemplateLink(
  listingId: string,
): Promise<ActionResult<{ template_id: string; title: string; archived: boolean } | null>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(listingId)) return { success: false, error: 'ID가 올바르지 않습니다' }
  const { data, error } = await auth.admin
    .from('commerce_listing_detail_links')
    .select('template_id, commerce_detail_templates ( title, archived_at )')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (error) return { success: false, error: schemaError(error.message) }
  if (!data) return { success: true, data: null }
  const r = data as unknown as Record<string, unknown>
  const t = (Array.isArray(r.commerce_detail_templates) ? r.commerce_detail_templates[0] : r.commerce_detail_templates) as
    | { title?: string; archived_at?: string | null }
    | undefined
  return {
    success: true,
    data: { template_id: String(r.template_id), title: String(t?.title ?? ''), archived: Boolean(t?.archived_at) },
  }
}

// ── 플랫폼 발주 안내 (시스템값) ──────────────────────────────────────────────────

export async function getOrderGuideSettings(): Promise<ActionResult<OrderGuideSettings>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { data, error } = await auth.admin
    .from('admin_settings')
    .select('key, value')
    .in('key', Object.values(ORDER_GUIDE_SETTING_KEYS))
  if (error) return { success: false, error: error.message }
  return { success: true, data: parseOrderGuideSettings((data ?? []) as { key: string; value: string | null }[]) }
}

/**
 * 발주 마감 시각·배송 요일 — 상품마다 입력하지 않고 플랫폼에 한 번만 둔다(시스템값).
 * 빈 값으로 저장하면 상세페이지에서 그 줄이 숨겨진다.
 */
export async function updateOrderGuideSettings(input: { cutoffTime: string; deliveryWeekdays: number[] }): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const cutRaw = String(input.cutoffTime ?? '').trim()
  const cutoff = cutRaw ? parseCutoffTime(cutRaw) : ''
  if (cutoff === null) return { success: false, error: '발주 마감은 24시간 형식(예: 15:00)으로 입력해 주세요' }
  const daysRaw = (input.deliveryWeekdays ?? []).join(',')
  const days = daysRaw ? parseWeekdays(daysRaw) : []
  if (days === null) return { success: false, error: '배송 요일이 올바르지 않습니다' }

  const next: Record<string, string> = {
    [ORDER_GUIDE_SETTING_KEYS.cutoffTime]: cutoff,
    [ORDER_GUIDE_SETTING_KEYS.deliveryWeekdays]: days.join(','),
  }
  const descriptions: Record<string, string> = {
    [ORDER_GUIDE_SETTING_KEYS.cutoffTime]: 'storefront 발주 마감 시각(KST, HH:MM). 빈 값이면 상세페이지에서 숨김',
    [ORDER_GUIDE_SETTING_KEYS.deliveryWeekdays]: 'storefront 배송 요일(1=월…7=일, 쉼표). 빈 값이면 상세페이지에서 숨김',
  }

  const { data: beforeRows, error: bErr } = await auth.admin
    .from('admin_settings')
    .select('key, value')
    .in('key', Object.keys(next))
  if (bErr) return { success: false, error: bErr.message }
  const before = Object.fromEntries(((beforeRows ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]))

  const nowIso = new Date().toISOString()
  const { error } = await auth.admin.from('admin_settings').upsert(
    Object.entries(next).map(([key, value]) => ({
      key,
      value,
      description: descriptions[key],
      updated_by: auth.ctx.user_id,
      updated_at: nowIso,
    })),
    { onConflict: 'key' },
  )
  if (error) return { success: false, error: error.message }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'admin_setting_update',
    target_table: 'admin_settings',
    target_id: null,
    old_value: before,
    new_value: next,
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath('/admin/commerce/detail-templates')
  return { success: true }
}
