'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

/** 시드 SSOT — 런타임 계산은 DB 값 우선, 조회 전에는 반드시 ensure로 채움 */
export const POLICY_SETTING_DEFAULTS: Record<string, { value: string; description: string }> = {
  platform_fee_rate: { value: '3', description: '플랫폼 수수료율 (%)' },
  settlement_cycle_days: { value: '30', description: '정산 주기 (일)' },
  order_cycle_calculation_count: { value: '3', description: '주문 주기 계산 기준 건수' },
  signal_suppression_days: { value: '7', description: '신호 억제 기간 (일)' },
  rfq_repeat_limit: { value: '3', description: '발주요청 반복 제한 (회)' },
  delivery_signal_window: { value: '5', description: '납기 신호 윈도우 (일)' },
  rfq_open_duration_hours: { value: '24', description: '입찰 공개 시간 (시간)' },
  trust_supplier_level1: { value: '70', description: '공급자 Level 1 상한 (점수 이하)' },
  trust_supplier_level2: { value: '60', description: '공급자 Level 2 상한 (점수 이하)' },
  trust_supplier_level3: { value: '50', description: '공급자 Level 3 상한 (점수 이하)' },
  trust_restaurant_level1: { value: '60', description: '식당 Level 1 상한 (점수 이하)' },
  trust_restaurant_level2: { value: '50', description: '식당 Level 2 상한 (점수 이하)' },
  trust_restaurant_level3: { value: '40', description: '식당 Level 3 상한 (점수 이하)' },
  aligo_user_id: { value: '', description: '알리고 사용자 ID' },
  aligo_api_key: { value: '', description: '알리고 API Key' },
  aligo_sender: { value: '', description: '알리고 발신번호 (숫자)' },
}

const POLICY_DEFAULT_INSERT_ORDER = Object.keys(POLICY_SETTING_DEFAULTS)

export function policySettingReasonKey(key: string) {
  return `admin_setting:key:${key}`
}

export interface PolicySettingItem {
  key: string
  value: string
  description: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface GroupedPolicySettings {
  fee: PolicySettingItem[]
  trust_supplier: PolicySettingItem[]
  trust_restaurant: PolicySettingItem[]
  sales: PolicySettingItem[]
  order: PolicySettingItem[]
  notify: PolicySettingItem[]
}

export interface AdminSettingHistoryRow {
  id: string
  created_at: string
  admin_id: string | null
  before_value: string | null
  after_value: string | null
}

export interface TrustLevelThresholds {
  supplier: { l1: number; l2: number; l3: number }
  restaurant: { l1: number; l2: number; l3: number }
}

type InternalResult<T = void> = { success: boolean; data?: T; error?: string }

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

async function insertAdminLog(
  supabase: any,
  input: {
    admin_id: string
    action_type: string
    tenant_id?: string | null
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: any
    new_value?: any
  },
) {
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

/** 누락된 키만 INSERT (migration 없음 전제) */
export async function ensurePolicyDefaults(
  supabase: any,
  opts?: { adminUserId?: string | null },
): Promise<InternalResult<{ insertedKeys: string[] }>> {
  const nowIso = new Date().toISOString()
  const insertedKeys: string[] = []

  for (const key of POLICY_DEFAULT_INSERT_ORDER) {
    const meta = POLICY_SETTING_DEFAULTS[key]
    if (!meta) continue
    const { data: ex } = await supabase.from('admin_settings').select('id').eq('key', key).maybeSingle()
    if (ex) continue
    const { error } = await supabase.from('admin_settings').insert({
      key,
      value: meta.value,
      description: meta.description,
      updated_at: nowIso,
    })
    if (error) return { success: false, error: error.message }
    insertedKeys.push(key)
  }

  if (insertedKeys.length && opts?.adminUserId) {
    const logRes = await insertAdminLog(supabase, {
      admin_id: opts.adminUserId,
      action_type: 'admin_settings_seed_policy',
      reason: 'policy console default keys',
      target_table: 'admin_settings',
      new_value: { inserted_keys: insertedKeys },
    })
    if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  return { success: true, data: { insertedKeys } }
}

function parseThreshold(raw: string | undefined, fallback: string): number {
  const n = Math.floor(Number(raw ?? fallback))
  return Number.isFinite(n) ? n : Math.floor(Number(fallback))
}

/** 신뢰도 엔진용 — admin_settings 기준 Level 경계 */
export async function getTrustLevelThresholds(
  supabase: any,
  adminUserId?: string | null,
): Promise<TrustLevelThresholds> {
  await ensurePolicyDefaults(supabase, adminUserId ? { adminUserId } : {})

  const keys = [
    'trust_supplier_level1',
    'trust_supplier_level2',
    'trust_supplier_level3',
    'trust_restaurant_level1',
    'trust_restaurant_level2',
    'trust_restaurant_level3',
  ] as const

  const { data: rows } = await supabase.from('admin_settings').select('key, value').in('key', [...keys])

  const m = new Map<string, string>((rows ?? []).map((r: any) => [String(r.key), String(r.value ?? '')]))

  return {
    supplier: {
      l1: parseThreshold(m.get('trust_supplier_level1'), POLICY_SETTING_DEFAULTS.trust_supplier_level1.value),
      l2: parseThreshold(m.get('trust_supplier_level2'), POLICY_SETTING_DEFAULTS.trust_supplier_level2.value),
      l3: parseThreshold(m.get('trust_supplier_level3'), POLICY_SETTING_DEFAULTS.trust_supplier_level3.value),
    },
    restaurant: {
      l1: parseThreshold(m.get('trust_restaurant_level1'), POLICY_SETTING_DEFAULTS.trust_restaurant_level1.value),
      l2: parseThreshold(m.get('trust_restaurant_level2'), POLICY_SETTING_DEFAULTS.trust_restaurant_level2.value),
      l3: parseThreshold(m.get('trust_restaurant_level3'), POLICY_SETTING_DEFAULTS.trust_restaurant_level3.value),
    },
  }
}

export function resolveTrustLevel(role: 'supplier' | 'restaurant', score: number, t: TrustLevelThresholds): number {
  if (role === 'supplier') {
    if (score <= t.supplier.l3) return 3
    if (score <= t.supplier.l2) return 2
    if (score <= t.supplier.l1) return 1
    return 0
  }
  if (score <= t.restaurant.l3) return 3
  if (score <= t.restaurant.l2) return 2
  if (score <= t.restaurant.l1) return 1
  return 0
}

function rowToItem(row: any): PolicySettingItem {
  return {
    key: row.key,
    value: String(row.value ?? ''),
    description: row.description ?? null,
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  }
}

function groupItems(rows: PolicySettingItem[]): GroupedPolicySettings {
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter(Boolean) as PolicySettingItem[]

  return {
    fee: pick(['platform_fee_rate', 'settlement_cycle_days']),
    trust_supplier: pick(['trust_supplier_level1', 'trust_supplier_level2', 'trust_supplier_level3']),
    trust_restaurant: pick(['trust_restaurant_level1', 'trust_restaurant_level2', 'trust_restaurant_level3']),
    sales: pick(['order_cycle_calculation_count', 'signal_suppression_days', 'rfq_repeat_limit']),
    order: pick(['delivery_signal_window', 'rfq_open_duration_hours']),
    notify: pick(['aligo_user_id', 'aligo_api_key', 'aligo_sender']),
  }
}

export async function getAdminSettings(): Promise<ActionResult<{ grouped: GroupedPolicySettings; all: PolicySettingItem[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const seed = await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })
  if (!seed.success) return { success: false, error: seed.error }

  const { data: rows, error } = await supabase.from('admin_settings').select('*').order('key')
  if (error) return { success: false, error: error.message }

  const items = (rows ?? []).map(rowToItem)
  const grouped = groupItems(items)

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'policy_console_view',
    target_table: 'admin_settings',
  }).catch(() => {})

  return { success: true, data: { grouped, all: items } }
}

function normalizeNumericPolicyValue(key: string, raw: string): InternalResult<string> {
  const v = raw.trim()
  const numericKeys = new Set([
    'settlement_cycle_days',
    'order_cycle_calculation_count',
    'signal_suppression_days',
    'rfq_repeat_limit',
    'delivery_signal_window',
    'rfq_open_duration_hours',
    'trust_supplier_level1',
    'trust_supplier_level2',
    'trust_supplier_level3',
    'trust_restaurant_level1',
    'trust_restaurant_level2',
    'trust_restaurant_level3',
  ])
  if (key === 'platform_fee_rate') {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return { success: false, error: '유효한 수수료율이 아닙니다.' }
    return { success: true, data: String(n) }
  }
  if (!numericKeys.has(key)) return { success: true, data: v }
  const n = Number(v)
  if (!Number.isFinite(n)) return { success: false, error: '숫자만 입력할 수 있습니다.' }
  if (n < 0) return { success: false, error: '0 이상이어야 합니다.' }
  return { success: true, data: String(Math.floor(n)) }
}

/** 관리자 세션의 user_id만 실제 updated_by로 기록 (클라이언트 인자는 무시) */
export async function updateAdminSetting(key: string, value: string, _updated_by?: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!key?.trim()) return { success: false, error: 'key가 올바르지 않습니다.' }
  if (!(key in POLICY_SETTING_DEFAULTS)) return { success: false, error: '허용되지 않은 설정 키입니다.' }

  const norm = normalizeNumericPolicyValue(key, value)
  if (!norm.success || norm.data == null) return { success: false, error: norm.error ?? '유효하지 않은 값' }
  const nextVal = norm.data

  const seed = await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })
  if (!seed.success) return { success: false, error: seed.error }

  const { data: beforeRow } = await supabase.from('admin_settings').select('value').eq('key', key).maybeSingle()
  const beforeVal = String((beforeRow as any)?.value ?? '')

  if (beforeVal === nextVal) {
    return { success: true }
  }

  const nowIso = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('admin_settings')
    .update({
      value: nextVal,
      updated_at: nowIso,
      updated_by: auth.ctx.user_id,
    })
    .eq('key', key)

  if (upErr) return { success: false, error: upErr.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'admin_setting_update',
    reason: policySettingReasonKey(key),
    target_table: 'admin_settings',
    target_id: key,
    old_value: { key, before_value: beforeVal },
    new_value: { key, after_value: nextVal, updated_by: auth.ctx.user_id },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/policy')
  revalidatePath('/admin/settlements')
  return { success: true }
}

export async function getAdminSettingHistory(key: string): Promise<ActionResult<AdminSettingHistoryRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!(key in POLICY_SETTING_DEFAULTS)) return { success: false, error: '허용되지 않은 설정 키입니다.' }

  const { data: logs, error } = await supabase
    .from('admin_logs')
    .select('id, admin_id, old_value, new_value, created_at')
    .eq('action_type', 'admin_setting_update')
    .eq('reason', policySettingReasonKey(key))
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { success: false, error: error.message }

  const rows: AdminSettingHistoryRow[] = (logs ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    admin_id: r.admin_id ?? null,
    before_value: r.old_value?.before_value != null ? String(r.old_value.before_value) : null,
    after_value: r.new_value?.after_value != null ? String(r.new_value.after_value) : null,
  }))

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'policy_console_history_view',
    target_table: 'admin_logs',
    new_value: { key },
  }).catch(() => {})

  return { success: true, data: rows }
}

function normalizePhoneDigits(phone: string): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

export async function sendPolicyConsoleAligoTest(): Promise<ActionResult<{ detail?: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })

  const { data: cfg } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', ['aligo_user_id', 'aligo_api_key', 'aligo_sender'])

  const m = new Map((cfg ?? []).map((r: any) => [r.key, String(r.value ?? '')]))
  const user_id = (m.get('aligo_user_id') ?? '').trim()
  const api_key = (m.get('aligo_api_key') ?? '').trim()
  const sender = normalizePhoneDigits(m.get('aligo_sender') ?? '')

  if (!user_id || !api_key || !sender) {
    return { success: false, error: 'admin_settings에 알리고 사용자 ID / API Key / 발신번호를 채워주세요.' }
  }

  const msg = '식식이OS 관리자 정책 콘솔 — 알리고 연동 테스트'
  const form = new FormData()
  form.set('key', api_key)
  form.set('user_id', user_id)
  form.set('sender', sender)
  form.set('receiver', sender)
  form.set('msg', msg)

  let aligo_response: any = null
  let ok = false
  try {
    const res = await fetch('https://apis.aligo.in/send/', { method: 'POST', body: form })
    const ct = res.headers.get('content-type') ?? ''
    const json = ct.includes('application/json') ? await res.json() : await res.text()
    aligo_response = json
    const result_code = typeof json === 'object' ? String((json as any)?.result_code ?? '') : ''
    ok = result_code === '1'
  } catch (e: any) {
    aligo_response = { error: e?.message ?? 'FETCH_ERROR' }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'policy_console_aligo_test',
    target_table: 'admin_settings',
    new_value: { ok, aligo_response },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  if (!ok) {
    const detail =
      typeof aligo_response === 'object'
        ? String((aligo_response as any)?.message ?? (aligo_response as any)?.result_message ?? '발송 실패')
        : '발송 실패'
    return { success: false, error: detail }
  }

  return { success: true, data: { detail: '테스트 발송 요청이 접수되었습니다.' } }
}

/** 플랫폼 정책 숫자 — 테넌트 등 일반 세션에서도 `admin_settings` SELECT만 시도. 실패·무효·미존재 시 `POLICY_SETTING_DEFAULTS` 폴백 (D-018). */
export async function getAdminSettingNumber(
  key: keyof typeof POLICY_SETTING_DEFAULTS | string,
  bounds?: { min: number; max: number },
): Promise<number> {
  const meta = POLICY_SETTING_DEFAULTS[key as string]
  let fallback = meta ? Math.floor(Number(meta.value)) : 0
  if (!Number.isFinite(fallback)) fallback = 0

  const clamp = (n: number) =>
    bounds ? Math.max(bounds.min, Math.min(bounds.max, n)) : n

  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.from('admin_settings').select('value').eq('key', key).maybeSingle()
    if (error || data == null) return clamp(fallback)
    const n = Math.floor(Number((data as { value?: string }).value))
    if (!Number.isFinite(n)) return clamp(fallback)
    return clamp(n)
  } catch {
    return clamp(fallback)
  }
}
