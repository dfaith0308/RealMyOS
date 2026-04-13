'use server'

import { serializeSafe } from '@/lib/serialize-safe'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

// ============================================================
// 타입
// ============================================================

export type CollectionMethod = 'card' | 'cash' | 'transfer'
export type CollectionStatus = 'pending' | 'done' | 'cancelled'

export interface CollectionSchedule {
  id:             string
  customer_id:    string
  scheduled_date: string
  method:         CollectionMethod
  note:           string | null
  status:         CollectionStatus
  created_at:     string
}

export interface CollectionScheduleInput {
  customer_id:    string
  scheduled_date: string   // YYYY-MM-DD
  method:         CollectionMethod
  note?:          string
}

// ============================================================
// 수금 예정 등록
// ============================================================

export async function createCollectionSchedule(
  input: CollectionScheduleInput
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.scheduled_date) return { success: false, error: '날짜를 입력해주세요.' }

  // 기존 pending 취소 후 신규 등록 — unique index 충돌 방지
  await supabase
    .from('collection_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('customer_id', input.customer_id)
    .eq('tenant_id',   ctx.tenant_id)
    .eq('status',      'pending')

  const { data, error } = await supabase
    .from('collection_schedules')
    .insert({
      tenant_id:      ctx.tenant_id,
      customer_id:    input.customer_id,
      scheduled_date: input.scheduled_date,
      method:         input.method,
      note:           input.note?.trim() || null,
      status:         'pending',
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }

  revalidatePath('/customers')
  return { success: true, data: { id: data.id } }
}

// ============================================================
// 수금 예정 수정
// ============================================================

export async function updateCollectionSchedule(
  id: string,
  input: Partial<Pick<CollectionScheduleInput, 'scheduled_date' | 'method' | 'note'>>
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const payload: Record<string, any> = { updated_at: new Date().toISOString() }
  if (input.scheduled_date !== undefined) payload.scheduled_date = input.scheduled_date
  if (input.method !== undefined)         payload.method         = input.method
  if (input.note   !== undefined)         payload.note           = input.note?.trim() || null

  const { error } = await supabase
    .from('collection_schedules')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/customers')
  return { success: true, data: null }
}

// ============================================================
// 수금 예정 취소
// ============================================================

export async function cancelCollectionSchedule(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('collection_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/customers')
  return { success: true, data: null }
}

// ============================================================
// 수금 완료 시 pending → done (customer 기준 — 일반 수금)
// ============================================================

export async function markCollectionDone(
  customer_id: string,
  tenant_id:   string
): Promise<void> {
  const supabase = await createSupabaseServer()

  await supabase
    .from('collection_schedules')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('customer_id', customer_id)
    .eq('tenant_id',   tenant_id)
    .eq('status',      'pending')
}

// ============================================================
// 수금 완료 시 pending → done (schedule_id 기준 — 예정 수금)
// ============================================================

export async function markCollectionDoneById(
  schedule_id: string,
  tenant_id:   string
): Promise<void> {
  const supabase = await createSupabaseServer()

  await supabase
    .from('collection_schedules')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id',        schedule_id)
    .eq('tenant_id', tenant_id)
    .eq('status',    'pending')
}

// ============================================================
// 고객별 pending 예정 조회 (최신 1건)
// ============================================================

export async function getPendingCollectionSchedule(
  customer_id: string
): Promise<ActionResult<CollectionSchedule | null>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data } = await supabase
    .from('collection_schedules')
    .select('id, customer_id, scheduled_date, method, note, status, created_at')
    .eq('customer_id', customer_id)
    .eq('tenant_id',   ctx.tenant_id)
    .eq('status',      'pending')
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .single()

  return { success: true, data: data ?? null }
}

// ============================================================
// 전체 pending 예정 맵 조회 (ledger/dashboard 배치용)
// ============================================================

export interface CollectionMapResult {
  enabled: boolean
  data:    Record<string, CollectionSchedule | null>
  error:   string | null
}

export async function getPendingCollectionMap(
  tenant_id: string,
  supabase:  any
): Promise<CollectionMapResult> {
  try {
    const { data, error } = await supabase
      .from('collection_schedules')
      .select('id, customer_id, scheduled_date, method, note, status, created_at')
      .eq('tenant_id', tenant_id)
      .eq('status',    'pending')
      .order('scheduled_date', { ascending: true })

    if (error) {
      console.error('[getPendingCollectionMap] db error:', error.message)
      return { enabled: false, data: {}, error: error.message }
    }

    const result: Record<string, CollectionSchedule | null> = {}
    for (const row of data ?? []) {
      if (!result[row.customer_id]) result[row.customer_id] = row
    }
    return serializeSafe({ enabled: true, data: result, error: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    console.error('[getPendingCollectionMap] exception:', msg)
    return { enabled: false, data: {}, error: msg }
  }
}

// ============================================================
// 전체 pending 맵 — page.tsx Server Component용
// ============================================================

/** @deprecated CollectionMapResult 사용 */
export type CollectionScheduleMapResult = CollectionMapResult

export async function getCollectionScheduleMap(): Promise<CollectionMapResult> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { enabled: false, data: {}, error: '로그인 필요' }

  try {
    const { data, error } = await supabase
      .from('collection_schedules')
      .select('id, customer_id, scheduled_date, method, note, status, created_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('status',    'pending')
      .order('scheduled_date', { ascending: true })

    if (error) {
      console.error('[getCollectionScheduleMap] db error:', error.message)
      return { enabled: false, data: {}, error: error.message }
    }

    const result: Record<string, CollectionSchedule | null> = {}
    for (const row of data ?? []) {
      if (!result[row.customer_id]) result[row.customer_id] = row
    }
    return serializeSafe({ enabled: true, data: result, error: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    console.error('[getCollectionScheduleMap] exception:', msg)
    return { enabled: false, data: {}, error: msg }
  }
}