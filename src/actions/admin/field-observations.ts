'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import {
  CONTENT_TAG,
  type FieldObservationRow,
  type ObservationAction,
  type ObservationView,
} from '@/types/field-observation'

const LIST_LIMIT = 500
const MAX_PHOTOS = 10
/** 업로드 액션(uploadListingImage)이 돌려주는 commerce-images public URL 만 받는다 */
const STORAGE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const PHOTO_URL_PREFIX = STORAGE_ORIGIN
  ? `${STORAGE_ORIGIN}/storage/v1/object/public/commerce-images/`
  : ''

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

/** sales_lead_notes 와 같은 규칙 — '#' 제거, 20자 이하, 중복 제거, 최대 10개 */
function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const cleaned = input
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => t.length > 0 && t.length <= 20)
  return Array.from(new Set(cleaned)).slice(0, 10)
}

/**
 * 사진 URL 화이트리스트.
 * 클라이언트가 업로드 결과 URL을 그대로 돌려주는 구조라, 우리 버킷 경로가 아닌 주소가
 * 관리자 화면에 심어지는 것을 막는다 (sales_leads.naver_place_url 과 같은 취지).
 */
function sanitizePhotoUrls(input: unknown): string[] {
  if (!PHOTO_URL_PREFIX || !Array.isArray(input)) return []
  const cleaned = input
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.startsWith(PHOTO_URL_PREFIX))
  return Array.from(new Set(cleaned)).slice(0, MAX_PHOTOS)
}

function toRow(raw: Record<string, unknown>): FieldObservationRow {
  return {
    id: String(raw.id),
    photo_urls: (raw.photo_urls as string[] | null) ?? [],
    memo: String(raw.memo ?? ''),
    location: (raw.location as string | null) ?? null,
    tags: (raw.tags as string[] | null) ?? [],
    status: raw.status as FieldObservationRow['status'],
    created_by: (raw.created_by as string | null) ?? null,
    created_at: String(raw.created_at),
  }
}

/**
 * 관찰기록 목록.
 * 조회는 항상 1회다 — 파생값이 없어 행별 추가 질의가 없다.
 */
export async function listFieldObservations(params: {
  view: ObservationView
  q?: string
}): Promise<ActionResult<{ observations: FieldObservationRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createSupabaseAdmin()

    let query = supabase
      .from('field_observations')
      .select('id, photo_urls, memo, location, tags, status, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (params.view === 'content') {
      // 보관만 표시한 것 — 버린 건 제외
      query = query.contains('tags', [CONTENT_TAG]).neq('status', 'discarded')
    } else if (params.view === 'converted') {
      query = query.eq('status', 'converted')
    } else if (params.view === 'discarded') {
      query = query.eq('status', 'discarded')
    } else {
      // 기본 — 미분류 중 '콘텐츠소재'로 빼둔 것은 숨긴다.
      // tags 가 NOT NULL DEFAULT '{}' 라서 NOT (tags @> ...) 이 NULL 로 새지 않는다.
      query = query.eq('status', 'unclassified').not('tags', 'cs', `{"${CONTENT_TAG}"}`)
    }

    if (params.q?.trim()) {
      const q = params.q.trim().replace(/[%,()]/g, '')
      if (q) query = query.ilike('memo', `%${q}%`)
    }

    const { data, error } = await query
    if (error) return { success: false, error: error.message }

    return {
      success: true,
      data: { observations: (data ?? []).map((r) => toRow(r as Record<string, unknown>)) },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '관찰기록을 불러오지 못했습니다' }
  }
}

/** 빠른 등록 — 메모만 필수, 나머지는 있으면 담는다 */
export async function createFieldObservation(input: {
  memo: string
  photo_urls?: string[]
  location?: string
  tags?: string[]
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const memo = (input.memo ?? '').trim()
  if (!memo) return { success: false, error: '메모를 입력하세요' }

  try {
    const supabase = await createSupabaseAdmin()
    const { data, error } = await supabase
      .from('field_observations')
      .insert({
        memo,
        photo_urls: sanitizePhotoUrls(input.photo_urls),
        location: (input.location ?? '').trim() || null,
        tags: sanitizeTags(input.tags),
        created_by: auth.ctx.user_id,
      })
      .select('id')
      .single()

    if (error) return { success: false, error: error.message }

    revalidatePath('/admin/sales')
    return { success: true, data: { id: data.id as string } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '관찰기록 저장에 실패했습니다' }
  }
}

/**
 * 체크한 관찰기록들을 한 번에 확정한다.
 * 리드 생성 · 최초 메모 복사 · 원본 상태 변경이 3개 테이블에 걸치므로
 * RULE-19 에 따라 RPC 한 번으로 처리한다 (건별 호출 없음).
 */
export async function applyFieldObservationActions(
  items: ObservationAction[],
): Promise<ActionResult<{ lead_ids: string[]; converted: number; discarded: number; kept: number }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: '처리할 관찰기록을 선택하세요' }
  }

  const payload = items.map((it) => {
    const leadTypes = Array.isArray(it.lead_types)
      ? Array.from(new Set(it.lead_types.filter((t) => t === 'restaurant' || t === 'supplier')))
      : []
    return {
      observation_id: String(it.observation_id ?? ''),
      lead_types: leadTypes,
      company_name: (it.company_name ?? '').trim().slice(0, 80),
      keep_as_content: !!it.keep_as_content,
      discard: !!it.discard,
    }
  })

  if (payload.some((p) => !p.observation_id)) {
    return { success: false, error: '관찰기록 ID 가 없습니다' }
  }

  try {
    const supabase = await createSupabaseAdmin()
    const { data, error } = await supabase.rpc('apply_field_observation_actions', {
      p_items: payload,
      p_created_by: auth.ctx.user_id,
    })
    if (error) return { success: false, error: error.message }

    const result = (data ?? {}) as {
      success?: boolean
      error?: string
      lead_ids?: string[]
      converted?: number
      discarded?: number
      kept?: number
    }
    if (!result.success) return { success: false, error: result.error ?? '확정에 실패했습니다' }

    revalidatePath('/admin/sales')
    return {
      success: true,
      data: {
        lead_ids: result.lead_ids ?? [],
        converted: result.converted ?? 0,
        discarded: result.discarded ?? 0,
        kept: result.kept ?? 0,
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '확정에 실패했습니다' }
  }
}
