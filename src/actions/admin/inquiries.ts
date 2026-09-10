'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import {
  digitsOnly,
  isInquiryType,
  isResponseMethod,
  type InquiryRow,
  type InquiryView,
  type MatchCandidate,
} from '@/types/inquiry'

const LIST_LIMIT = 500
const MAX_PHOTOS = 10
const MAX_CANDIDATES = 20
/** 후보 검색은 최소 두 글자부터. 한 글자로 전 회원이 쏟아지면 고르는 의미가 없다 */
const MIN_QUERY_LENGTH = 2

/** 업로드 액션(uploadListingImage)이 돌려주는 commerce-images public URL 만 받는다 */
const STORAGE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const PHOTO_URL_PREFIX = STORAGE_ORIGIN
  ? `${STORAGE_ORIGIN}/storage/v1/object/public/commerce-images/`
  : ''

/** 연결 가능한 회원 역할. 관리자 계정이나 미지정 계정에는 붙이지 않는다 */
const MATCHABLE_ROLES = ['restaurant', 'supplier']

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인이 필요합니다' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

/**
 * 사진 URL 화이트리스트.
 * 클라이언트가 업로드 결과 URL을 그대로 돌려주는 구조라, 우리 버킷 경로가 아닌 주소가
 * 관리자 화면에 심어지는 것을 막는다 (field_observations 와 같은 취지).
 */
function sanitizePhotoUrls(input: unknown): string[] {
  if (!PHOTO_URL_PREFIX || !Array.isArray(input)) return []
  const cleaned = input
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.startsWith(PHOTO_URL_PREFIX))
  return Array.from(new Set(cleaned)).slice(0, MAX_PHOTOS)
}

function trimOrNull(v: unknown, max: number): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

function toRow(raw: Record<string, unknown>): Omit<InquiryRow, 'matched_tenant_name' | 'handled_by_email'> {
  return {
    id: String(raw.id),
    inquiry_type: String(raw.inquiry_type ?? ''),
    inquiry_type_etc: (raw.inquiry_type_etc as string | null) ?? null,
    response_method: String(raw.response_method ?? ''),
    response_method_etc: (raw.response_method_etc as string | null) ?? null,
    price_guided: !!raw.price_guided,
    price_guide_note: (raw.price_guide_note as string | null) ?? null,
    payment_guided: !!raw.payment_guided,
    payment_guide_note: (raw.payment_guide_note as string | null) ?? null,
    shipped: !!raw.shipped,
    shipping_note: (raw.shipping_note as string | null) ?? null,
    memo: String(raw.memo ?? ''),
    photo_urls: (raw.photo_urls as string[] | null) ?? [],
    customer_name: (raw.customer_name as string | null) ?? null,
    customer_phone: (raw.customer_phone as string | null) ?? null,
    inquired_at: String(raw.inquired_at),
    handled_by: (raw.handled_by as string | null) ?? null,
    match_status: raw.match_status === 'matched' ? 'matched' : 'unmatched',
    matched_tenant_id: (raw.matched_tenant_id as string | null) ?? null,
    matched_at: (raw.matched_at as string | null) ?? null,
    matched_by: (raw.matched_by as string | null) ?? null,
    created_at: String(raw.created_at),
  }
}

const INQUIRY_SELECT =
  'id, inquiry_type, inquiry_type_etc, response_method, response_method_etc, ' +
  'price_guided, price_guide_note, payment_guided, payment_guide_note, shipped, shipping_note, ' +
  'memo, photo_urls, customer_name, customer_phone, inquired_at, handled_by, ' +
  'match_status, matched_tenant_id, matched_at, matched_by, created_at'

/**
 * 표시용 이름을 한 번에 붙인다.
 * 행마다 tenants/users 를 다시 조회하면 목록 길이만큼 쿼리가 늘어난다(RULE-05 위반).
 * 필요한 id 를 모아 두 번의 IN 조회로 끝낸다.
 */
async function attachNames(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  rows: Array<Omit<InquiryRow, 'matched_tenant_name' | 'handled_by_email'>>,
): Promise<{ rows: InquiryRow[] } | { error: string }> {
  const tenantIds = Array.from(
    new Set(rows.map((r) => r.matched_tenant_id).filter((v): v is string => !!v)),
  )
  const userIds = Array.from(
    new Set(rows.map((r) => r.handled_by).filter((v): v is string => !!v)),
  )

  const [tenantRes, userRes] = await Promise.all([
    tenantIds.length > 0
      ? admin.from('tenants').select('id, name').in('id', tenantIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? admin.from('users').select('id, email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (tenantRes.error) return { error: tenantRes.error.message }
  if (userRes.error) return { error: userRes.error.message }

  const tenantName = new Map<string, string | null>()
  for (const t of (tenantRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    tenantName.set(t.id, t.name)
  }
  const userEmail = new Map<string, string | null>()
  for (const u of (userRes.data ?? []) as Array<{ id: string; email: string | null }>) {
    userEmail.set(u.id, u.email)
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      matched_tenant_name: r.matched_tenant_id ? (tenantName.get(r.matched_tenant_id) ?? null) : null,
      handled_by_email: r.handled_by ? (userEmail.get(r.handled_by) ?? null) : null,
    })),
  }
}

/** 문의 목록 */
export async function listInquiries(params: {
  view: InquiryView
  q?: string
}): Promise<ActionResult<{ inquiries: InquiryRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const admin = await createSupabaseAdmin()

    let query = admin
      .from('inquiries')
      .select(INQUIRY_SELECT)
      .order('inquired_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (params.view === 'unmatched') query = query.eq('match_status', 'unmatched')
    else if (params.view === 'matched') query = query.eq('match_status', 'matched')

    const q = (params.q ?? '').trim().replace(/[%,()]/g, '')
    if (q) {
      // 고객명·연락처·메모 어디에 있어도 찾히게 한다
      query = query.or(`customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%,memo.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) return { success: false, error: error.message }

    // INQUIRY_SELECT 는 문자열 상수라 supabase-js 가 행 타입을 추론하지 못한다.
    // 실제 형태 맞추기는 toRow() 가 한다.
    const raw = (data ?? []) as unknown as Array<Record<string, unknown>>
    const rows = raw.map((r) => toRow(r))
    const named = await attachNames(admin, rows)
    if ('error' in named) return { success: false, error: named.error }

    return { success: true, data: { inquiries: named.rows } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '문의를 불러오지 못했습니다' }
  }
}

/** 문의 1건 상세 */
export async function getInquiry(id: string): Promise<ActionResult<{ inquiry: InquiryRow }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id) return { success: false, error: '문의 ID 가 없습니다' }

  try {
    const admin = await createSupabaseAdmin()
    const { data, error } = await admin
      .from('inquiries')
      .select(INQUIRY_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: '문의를 찾을 수 없습니다' }

    const named = await attachNames(admin, [toRow(data as unknown as Record<string, unknown>)])
    if ('error' in named) return { success: false, error: named.error }

    return { success: true, data: { inquiry: named.rows[0] } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '문의를 불러오지 못했습니다' }
  }
}

/**
 * 문의 등록.
 * 담당자(handled_by)는 입력을 받지 않는다 — 로그인한 관리자를 서버가 채운다.
 */
export async function createInquiry(input: {
  inquiry_type: string
  inquiry_type_etc?: string
  response_method: string
  response_method_etc?: string
  price_guided?: boolean
  price_guide_note?: string
  payment_guided?: boolean
  payment_guide_note?: string
  shipped?: boolean
  shipping_note?: string
  memo?: string
  photo_urls?: string[]
  customer_name?: string
  customer_phone?: string
  inquired_at?: string
}): Promise<ActionResult<{ id: string }>> {
  // 1. 인증
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  // 2. 입력 검증
  if (!isInquiryType(input.inquiry_type)) return { success: false, error: '문의유형을 선택하세요' }
  if (!isResponseMethod(input.response_method)) {
    return { success: false, error: '응대방식을 선택하세요' }
  }

  const inquiry_type_etc = input.inquiry_type === 'other' ? trimOrNull(input.inquiry_type_etc, 40) : null
  if (input.inquiry_type === 'other' && !inquiry_type_etc) {
    return { success: false, error: '문의유형 기타 내용을 입력하세요' }
  }
  const response_method_etc =
    input.response_method === 'other' ? trimOrNull(input.response_method_etc, 40) : null
  if (input.response_method === 'other' && !response_method_etc) {
    return { success: false, error: '응대방식 기타 내용을 입력하세요' }
  }

  const customer_name = trimOrNull(input.customer_name, 60)
  const customer_phone = trimOrNull(input.customer_phone, 40)
  // 둘 다 없으면 나중에 회원과 맞춰볼 단서가 남지 않는다
  if (!customer_name && !customer_phone) {
    return { success: false, error: '고객명 또는 연락처 중 하나는 입력해야 합니다' }
  }

  let inquired_at = new Date().toISOString()
  if (input.inquired_at) {
    const d = new Date(input.inquired_at)
    if (Number.isNaN(d.getTime())) return { success: false, error: '문의일시가 올바르지 않습니다' }
    inquired_at = d.toISOString()
  }

  // 체크가 꺼져 있으면 부연 설명도 남기지 않는다 (O/X 와 내용이 어긋나지 않게)
  const price_guided = !!input.price_guided
  const payment_guided = !!input.payment_guided
  const shipped = !!input.shipped

  try {
    // 4. write (단일 테이블 — RPC 불필요)
    const admin = await createSupabaseAdmin()
    const { data, error } = await admin
      .from('inquiries')
      .insert({
        inquiry_type: input.inquiry_type,
        inquiry_type_etc,
        response_method: input.response_method,
        response_method_etc,
        price_guided,
        price_guide_note: price_guided ? trimOrNull(input.price_guide_note, 200) : null,
        payment_guided,
        payment_guide_note: payment_guided ? trimOrNull(input.payment_guide_note, 200) : null,
        shipped,
        shipping_note: shipped ? trimOrNull(input.shipping_note, 200) : null,
        memo: (input.memo ?? '').trim(),
        photo_urls: sanitizePhotoUrls(input.photo_urls),
        customer_name,
        customer_phone,
        inquired_at,
        handled_by: auth.ctx.user_id,
      })
      .select('id')
      .single()

    if (error) return { success: false, error: error.message }

    revalidatePath('/admin/inquiries')
    return { success: true, data: { id: data.id as string } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '문의 저장에 실패했습니다' }
  }
}

/**
 * 수동 매칭 후보 검색.
 *
 * **후보만 돌려준다. 여기서 연결하지 않는다.**
 * 이름·연락처가 정확히 같아도 같은 사람이라는 보장이 없다(동명이인, 번호 재사용,
 * 가족이 대신 건 전화). 확정은 matchInquiryToTenant() 를 사람이 눌러야 일어난다.
 *
 * 회원 목록을 한 번만 읽어 메모리에서 거른다.
 * 연락처는 표기가 제각각(010-1234-5678 / 01012345678)이라 SQL ilike 로는 놓치는 게 생긴다.
 * 숫자만 남겨 비교해야 같은 번호를 같다고 볼 수 있다.
 */
export async function searchMatchCandidates(params: {
  q: string
}): Promise<ActionResult<{ candidates: MatchCandidate[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const q = (params.q ?? '').trim()
  if (q.length < MIN_QUERY_LENGTH) {
    return { success: false, error: `검색어를 ${MIN_QUERY_LENGTH}글자 이상 입력하세요` }
  }

  try {
    const admin = await createSupabaseAdmin()
    const { data, error } = await admin
      .from('tenants')
      .select('id, name, role, owner_name, representative_name, phone, contact_phone')
      .in('role', MATCHABLE_ROLES)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(1000)

    if (error) return { success: false, error: error.message }

    const needle = q.toLowerCase()
    const needleDigits = digitsOnly(q)
    // 3자리 미만 숫자는 우연히 겹치는 게 너무 많아 번호 비교에 쓰지 않는다
    const usePhone = needleDigits.length >= 3

    const rows = (data ?? []) as Array<{
      id: string
      name: string | null
      role: string | null
      owner_name: string | null
      representative_name: string | null
      phone: string | null
      contact_phone: string | null
    }>

    const candidates: MatchCandidate[] = []
    for (const r of rows) {
      const matched_on: string[] = []

      const nameFields: Array<[string, string | null]> = [
        ['업체명', r.name],
        ['대표자', r.representative_name],
        ['담당자', r.owner_name],
      ]
      for (const [label, value] of nameFields) {
        if (value && value.toLowerCase().includes(needle)) matched_on.push(label)
      }

      if (usePhone) {
        const phoneFields: Array<[string, string | null]> = [
          ['연락처', r.contact_phone],
          ['전화', r.phone],
        ]
        for (const [label, value] of phoneFields) {
          const d = digitsOnly(value)
          if (d && d.includes(needleDigits)) matched_on.push(label)
        }
      }

      if (matched_on.length > 0) {
        candidates.push({
          id: r.id,
          name: r.name,
          role: r.role,
          owner_name: r.owner_name,
          representative_name: r.representative_name,
          phone: r.phone,
          contact_phone: r.contact_phone,
          matched_on,
        })
      }
    }

    return { success: true, data: { candidates: candidates.slice(0, MAX_CANDIDATES) } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '회원을 검색하지 못했습니다' }
  }
}

/**
 * 문의 → 회원 연결 확정.
 * 관리자가 후보 중 하나를 고르고 "이 회원이 맞다"를 누른 뒤에만 호출된다.
 *
 * inquiries UPDATE + admin_logs INSERT 두 테이블 write 이므로 RPC 한 번으로 처리한다(RULE-19).
 * 이미 연결된 문의인지 확인하는 것도 RPC 안에서 행을 잠근 뒤에 한다(RULE-20).
 */
export async function matchInquiryToTenant(input: {
  inquiry_id: string
  tenant_id: string
}): Promise<ActionResult<{ tenant_name: string | null }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.inquiry_id) return { success: false, error: '문의 ID 가 없습니다' }
  if (!input.tenant_id) return { success: false, error: '연결할 회원을 선택하세요' }

  try {
    const admin = await createSupabaseAdmin()
    const { data, error } = await admin.rpc('match_inquiry_to_tenant', {
      p_inquiry_id: input.inquiry_id,
      p_tenant_id: input.tenant_id,
      p_admin_id: auth.ctx.user_id,
    })

    if (error) return { success: false, error: error.message }

    const result = (data ?? {}) as { success?: boolean; error?: string; tenant_name?: string | null }
    if (!result.success) return { success: false, error: result.error ?? '연결에 실패했습니다' }

    revalidatePath('/admin/inquiries')
    revalidatePath(`/admin/inquiries/${input.inquiry_id}`)
    return { success: true, data: { tenant_name: result.tenant_name ?? null } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '연결에 실패했습니다' }
  }
}
