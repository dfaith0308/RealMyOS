'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { solapiChannels } from '@/lib/delivery-message/channels'
import { isMissingMessageSchema, sendDeliveryMessages, type SendSummary } from '@/lib/delivery-message/processor'
import { resolveSendSafety } from '@/lib/delivery-message/safety'
import {
  ALIMTALK_TEMPLATE_TEXT,
  composeDeliveryCompletedMessage,
  contentViolationMessage,
  findContentViolation,
} from '@/lib/delivery-message/template'
import { drainDomainEvents } from '@/lib/domain-events/drain'
import type { EventRunSummary } from '@/lib/delivery-message/processor'

/**
 * 관리자 — 배송 완료 자동 메시지 설정·결과·승인 발송·실패 재발송·제외 대상.
 *
 * 누구에게 보낼지는 DB 함수 delivery_message_targets() 가 정한다. 이 파일은 그 결과를 보여주고,
 * 사람이 누른 발송 요청을 processor 에 넘길 뿐 대상 조건을 따로 계산하지 않는다(원칙 3).
 */

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const PLATFORM_SCOPE = '00000000-0000-0000-0000-000000000000'
const MIGRATION_HINT = '자동 메시지 마이그레이션(20260915120000)이 아직 적용되지 않았습니다'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx, admin: await createSupabaseAdmin() }
}

function err(message: string | undefined): string {
  return isMissingMessageSchema(message) ? MIGRATION_HINT : String(message ?? '처리 실패')
}

async function log(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  input: { admin_id: string; action_type: string; target_table: string; target_id: string | null; tenant_id?: string | null; old_value?: unknown; new_value?: unknown },
): Promise<string | null> {
  const { error } = await admin.from('admin_logs').insert({
    admin_tenant_id: PLATFORM_SCOPE,
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    target_table: input.target_table,
    target_id: input.target_id,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  return error ? `admin_logs 기록 실패: ${error.message}` : null
}

// ── 조회 ─────────────────────────────────────────────────────────────────────────

export type MessageSettingsRow = {
  scope_tenant_id: string
  scope_name: string
  enabled: boolean
  send_mode: 'manual_confirm' | 'auto'
  sender_display: string | null
  thank_you_message: string | null
  updated_at: string | null
}

export type DispatchRow = {
  commerce_order_id: string
  order_number: string | null
  restaurant_name: string | null
  supplier_name: string | null
  /** 판정 함수 결과 */
  eligible: boolean
  ineligible_reason: string | null
  send_mode: string | null
  /** 발송 결과 (없으면 아직 처리 전) */
  status: string | null
  skip_reason: string | null
  last_attempt_at: string | null
  last_failure: string | null
}

export type DeliveryMessageDashboard = {
  safety: { test_mode: boolean; test_reason: string | null; kakao_template: boolean }
  alimtalk_template_text: string
  settings: MessageSettingsRow[]
  counts: { total: number; delivered_ok: number; failed: number; pending: number; skipped: number; test: number; sending: number; unprocessed_events: number }
  rows: DispatchRow[]
  exclusions: { id: string; tenant_id: string; tenant_name: string | null; reason: string; created_at: string }[]
}

export async function getDeliveryMessageDashboard(): Promise<ActionResult<DeliveryMessageDashboard>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { admin } = auth

  const [settingsRes, targetsRes, dispatchRes, exclRes, evRes] = await Promise.all([
    admin.from('delivery_message_settings').select('scope_tenant_id, enabled, send_mode, sender_display, thank_you_message, updated_at'),
    admin.rpc('delivery_message_targets', { p_order_ids: null }),
    admin.from('delivery_message_dispatches').select('id, commerce_order_id, status, skip_reason, last_attempt_at'),
    admin.from('delivery_message_exclusions').select('id, tenant_id, reason, created_at').is('released_at', null).order('created_at', { ascending: false }),
    admin.from('commerce_domain_events').select('id', { count: 'exact', head: true }).eq('event_type', 'delivery_completed').is('processed_at', null),
  ])
  for (const r of [settingsRes, targetsRes, dispatchRes, exclRes, evRes]) {
    if (r.error) return { success: false, error: err(r.error.message) }
  }

  const targets = (targetsRes.data ?? []) as Record<string, unknown>[]
  const dispatches = (dispatchRes.data ?? []) as { id: string; commerce_order_id: string; status: string; skip_reason: string | null; last_attempt_at: string | null }[]
  const dispatchByOrder = new Map(dispatches.map((d) => [d.commerce_order_id, d]))

  // 마지막 실패 사유 — 실패 상태 dispatch 의 시도만 한 번에 읽는다
  const failedIds = dispatches.filter((d) => d.status === 'both_failed' || d.status === 'failed').map((d) => d.id)
  const lastFailure = new Map<string, string>()
  if (failedIds.length) {
    const { data: att } = await admin
      .from('delivery_message_attempts')
      .select('dispatch_id, failure_reason, attempted_at')
      .in('dispatch_id', failedIds)
      .not('failure_reason', 'is', null)
      .order('attempted_at', { ascending: true })
    for (const a of (att ?? []) as { dispatch_id: string; failure_reason: string }[]) lastFailure.set(a.dispatch_id, a.failure_reason)
  }

  const tenantIds = new Set<string>()
  for (const t of targets) tenantIds.add(String(t.tenant_id))
  const settingsRows = (settingsRes.data ?? []) as Record<string, unknown>[]
  for (const s of settingsRows) tenantIds.add(String(s.scope_tenant_id))
  for (const x of (exclRes.data ?? []) as { tenant_id: string }[]) tenantIds.add(x.tenant_id)
  tenantIds.delete(PLATFORM_SCOPE)
  const names = new Map<string, string | null>()
  if (tenantIds.size) {
    const { data: tn } = await admin.from('tenants').select('id, name').in('id', [...tenantIds])
    for (const t of (tn ?? []) as { id: string; name: string | null }[]) names.set(t.id, t.name)
  }

  const rows: DispatchRow[] = targets.map((t) => {
    const d = dispatchByOrder.get(String(t.commerce_order_id))
    return {
      commerce_order_id: String(t.commerce_order_id),
      order_number: (t.order_number as string | null) ?? null,
      restaurant_name: names.get(String(t.tenant_id)) ?? null,
      supplier_name: (t.supplier_name as string | null) ?? null,
      eligible: t.eligible === true,
      ineligible_reason: (t.ineligible_reason as string | null) ?? null,
      send_mode: (t.send_mode as string | null) ?? null,
      status: d?.status ?? null,
      skip_reason: d?.skip_reason ?? null,
      last_attempt_at: d?.last_attempt_at ?? null,
      last_failure: d ? lastFailure.get(d.id) ?? null : null,
    }
  })

  const count = (f: (r: DispatchRow) => boolean) => rows.filter(f).length
  const safety = resolveSendSafety(process.env)

  return {
    success: true,
    data: {
      safety: { test_mode: safety.testMode, test_reason: safety.testReason, kakao_template: Boolean(safety.kakao) },
      alimtalk_template_text: ALIMTALK_TEMPLATE_TEXT,
      settings: settingsRows.map((s) => ({
        scope_tenant_id: String(s.scope_tenant_id),
        scope_name: String(s.scope_tenant_id) === PLATFORM_SCOPE ? '플랫폼 기본값' : names.get(String(s.scope_tenant_id)) ?? '(공급자)',
        enabled: s.enabled === true,
        send_mode: s.send_mode === 'auto' ? 'auto' : 'manual_confirm',
        sender_display: (s.sender_display as string | null) ?? null,
        thank_you_message: (s.thank_you_message as string | null) ?? null,
        updated_at: (s.updated_at as string | null) ?? null,
      })),
      counts: {
        total: rows.length,
        delivered_ok: count((r) => r.status === 'kakao_success' || r.status === 'sms_fallback_success'),
        failed: count((r) => r.status === 'both_failed' || r.status === 'failed'),
        pending: count((r) => r.status === 'pending_approval'),
        skipped: count((r) => r.status === 'skipped'),
        test: count((r) => r.status === 'test_simulated'),
        sending: count((r) => r.status === 'sending'),
        unprocessed_events: evRes.count ?? 0,
      },
      rows: rows.sort((a, b) => String(b.last_attempt_at ?? '').localeCompare(String(a.last_attempt_at ?? ''))),
      exclusions: ((exclRes.data ?? []) as { id: string; tenant_id: string; reason: string; created_at: string }[]).map((x) => ({
        ...x,
        tenant_name: names.get(x.tenant_id) ?? null,
      })),
    },
  }
}

// ── 설정 저장 — 광고 금지 검증은 여기(저장 단계)에서 ────────────────────────────────

export type SaveSettingsInput = {
  scope_tenant_id: string
  enabled: boolean
  send_mode: 'manual_confirm' | 'auto'
  sender_display: string
  thank_you_message: string
}

/** 저장 전 검증 — 화면 미리보기도 같은 함수로 막힌 이유를 보여준다 */
function validateSettings(input: SaveSettingsInput): string | null {
  if (!UUID_RE.test(input.scope_tenant_id)) return '설정 범위가 올바르지 않습니다'
  if (input.send_mode !== 'manual_confirm' && input.send_mode !== 'auto') return '발송 모드가 올바르지 않습니다'
  const sender = (input.sender_display ?? '').trim()
  const thanks = (input.thank_you_message ?? '').trim()
  if (sender.length > 40) return '보내는 분 표기는 40자 이하입니다'
  if (thanks.length > 300) return '감사 메시지는 300자 이하입니다'
  const v1 = findContentViolation(sender)
  if (v1) return contentViolationMessage('보내는 분 표기', v1)
  const v2 = findContentViolation(thanks)
  if (v2) return contentViolationMessage('감사 메시지', v2)
  return null
}

export async function saveDeliveryMessageSettings(input: SaveSettingsInput): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const invalid = validateSettings(input)
  if (invalid) return { success: false, error: invalid }

  if (input.scope_tenant_id !== PLATFORM_SCOPE) {
    const { data: t } = await auth.admin.from('tenants').select('id, role').eq('id', input.scope_tenant_id).maybeSingle()
    if (!t || (t as { role?: string }).role !== 'supplier') return { success: false, error: '공급자 계정에만 개별 설정을 둘 수 있습니다' }
  }

  const { data: before } = await auth.admin
    .from('delivery_message_settings')
    .select('enabled, send_mode, sender_display, thank_you_message')
    .eq('scope_tenant_id', input.scope_tenant_id)
    .maybeSingle()

  const row = {
    scope_tenant_id: input.scope_tenant_id,
    enabled: Boolean(input.enabled),
    send_mode: input.send_mode,
    sender_display: input.sender_display.trim() || null,
    thank_you_message: input.thank_you_message.trim() || null,
    updated_by: auth.ctx.user_id,
    updated_at: new Date().toISOString(),
  }
  const { error } = await auth.admin.from('delivery_message_settings').upsert(row, { onConflict: 'scope_tenant_id' })
  if (error) return { success: false, error: err(error.message) }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'delivery_message_settings_saved',
    target_table: 'delivery_message_settings',
    target_id: null,
    tenant_id: input.scope_tenant_id === PLATFORM_SCOPE ? null : input.scope_tenant_id,
    old_value: before ?? null,
    new_value: row,
  })
  if (logErr) return { success: false, error: logErr }

  revalidatePath('/admin/commerce/delivery-messages')
  return { success: true }
}

/** 미리보기 — 저장 전에 실제로 나갈 문구와 막히는 이유를 보여준다 */
export async function previewDeliveryMessage(input: SaveSettingsInput & { supplier_name?: string | null }): Promise<
  ActionResult<{ text: string; violation: string | null }>
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const composed = composeDeliveryCompletedMessage({
    orderId: '00000000-0000-0000-0000-000000000000',
    orderNumber: 'ORD-20260915-00001',
    settingsSenderDisplay: input.sender_display || null,
    supplierName: input.supplier_name ?? null,
    thankYouMessage: input.thank_you_message || null,
  })
  return { success: true, data: { text: composed.text, violation: validateSettings(input) } }
}

// ── 발송 ─────────────────────────────────────────────────────────────────────────

/** 선택한 주문 승인 발송 / 실패 건 재발송 — 둘 다 판정 함수가 대상이라고 한 주문만 실제로 잡힌다 */
export async function sendSelectedDeliveryMessages(orderIds: string[]): Promise<ActionResult<SendSummary>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const ids = (orderIds ?? []).filter((x) => UUID_RE.test(x))
  if (!ids.length) return { success: false, error: '보낼 주문을 선택해 주세요' }

  const res = await sendDeliveryMessages(auth.admin, ids, { actorUserId: auth.ctx.user_id, channels: solapiChannels, env: process.env })
  if (!res.ok) return { success: false, error: res.error }

  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'delivery_message_send_requested',
    target_table: 'delivery_message_dispatches',
    target_id: null,
    new_value: { order_ids: ids, summary: res.summary },
  })
  if (logErr) console.error('[delivery-messages]', logErr)

  revalidatePath('/admin/commerce/delivery-messages')
  return { success: true, data: res.summary }
}

/** 실패한 주문만 골라 재발송 — "실패"의 기준도 판정 함수 결과(eligible + 실패 상태)를 그대로 쓴다 */
export async function resendFailedDeliveryMessages(): Promise<ActionResult<SendSummary>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const { data, error } = await auth.admin.rpc('delivery_message_targets', { p_order_ids: null })
  if (error) return { success: false, error: err(error.message) }
  const targetIds = new Set(((data ?? []) as { commerce_order_id: string; eligible: boolean }[]).filter((t) => t.eligible).map((t) => t.commerce_order_id))
  const { data: failed, error: fErr } = await auth.admin
    .from('delivery_message_dispatches')
    .select('commerce_order_id')
    .in('status', ['both_failed', 'failed'])
  if (fErr) return { success: false, error: err(fErr.message) }
  const ids = ((failed ?? []) as { commerce_order_id: string }[]).map((d) => d.commerce_order_id).filter((id) => targetIds.has(id))
  if (!ids.length) return { success: false, error: '재발송할 실패 건이 없습니다' }
  return sendSelectedDeliveryMessages(ids)
}

/** 「지금 한 번 돌려보기」 — 처리 안 된 배송 완료 사건을 지금 처리 */
export async function runDeliveryEventsNow(): Promise<ActionResult<EventRunSummary>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const res = await drainDomainEvents(auth.admin, auth.ctx.user_id)
  if (!res.ok) return { success: false, error: res.error }
  revalidatePath('/admin/commerce/delivery-messages')
  return { success: true, data: res.delivery_completed }
}

// ── 제외 대상 ────────────────────────────────────────────────────────────────────

export async function searchTenantsForDeliveryMessages(query: string, role: 'restaurant' | 'supplier'): Promise<
  ActionResult<{ rows: { id: string; name: string | null }[] }>
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const q = String(query ?? '').replace(/[,()*%\\]/g, ' ').trim().slice(0, 40)
  if (!q) return { success: true, data: { rows: [] } }
  const { data, error } = await auth.admin
    .from('tenants')
    .select('id, name')
    .eq('role', role === 'supplier' ? 'supplier' : 'restaurant')
    .is('deleted_at', null)
    .ilike('name', `%${q}%`)
    .limit(20)
  if (error) return { success: false, error: error.message }
  return { success: true, data: { rows: (data ?? []) as { id: string; name: string | null }[] } }
}

export async function addDeliveryMessageExclusion(tenantId: string, reason: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(tenantId)) return { success: false, error: '식당이 올바르지 않습니다' }
  const r = String(reason ?? '').trim()
  if (!r || r.length > 200) return { success: false, error: '제외 사유를 200자 이내로 적어 주세요' }

  const { data, error } = await auth.admin
    .from('delivery_message_exclusions')
    .insert({ tenant_id: tenantId, reason: r, created_by: auth.ctx.user_id })
    .select('id')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return { success: false, error: '이미 제외된 식당입니다' }
    return { success: false, error: err(error.message) }
  }
  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'delivery_message_exclusion_added',
    target_table: 'delivery_message_exclusions',
    target_id: data.id,
    tenant_id: tenantId,
    new_value: { reason: r },
  })
  if (logErr) return { success: false, error: logErr }
  revalidatePath('/admin/commerce/delivery-messages')
  return { success: true }
}

/** 제외 해제 — 행을 지우지 않고 released_at 을 남긴다 */
export async function releaseDeliveryMessageExclusion(id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'ID가 올바르지 않습니다' }
  const { data, error } = await auth.admin
    .from('delivery_message_exclusions')
    .update({ released_at: new Date().toISOString(), released_by: auth.ctx.user_id })
    .eq('id', id)
    .is('released_at', null)
    .select('tenant_id')
    .maybeSingle()
  if (error) return { success: false, error: err(error.message) }
  if (!data) return { success: false, error: '이미 해제된 항목입니다' }
  const logErr = await log(auth.admin, {
    admin_id: auth.ctx.user_id,
    action_type: 'delivery_message_exclusion_released',
    target_table: 'delivery_message_exclusions',
    target_id: id,
    tenant_id: (data as { tenant_id: string }).tenant_id,
  })
  if (logErr) return { success: false, error: logErr }
  revalidatePath('/admin/commerce/delivery-messages')
  return { success: true }
}
