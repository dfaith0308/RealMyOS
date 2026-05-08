'use server'

import { revalidatePath } from 'next/cache'
import { POLICY_SETTING_DEFAULTS } from '@/lib/policy-setting-defaults'
import { policySettingReasonKey, type TrustLevelThresholds } from '@/lib/policy-utils'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export type { TrustLevelThresholds } from '@/lib/policy-utils'

const POLICY_DEFAULT_INSERT_ORDER = Object.keys(POLICY_SETTING_DEFAULTS)

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

export async function checkPolicyConflict(
  key: string,
  newValue: string,
): Promise<ActionResult<{ hasConflict: boolean; message: string | null }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!key?.trim()) return { success: false, error: 'key가 올바르지 않습니다.' }
  if (!(key in POLICY_SETTING_DEFAULTS)) return { success: false, error: '허용되지 않은 설정 키입니다.' }

  await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })

  const norm = normalizeNumericPolicyValue(key, newValue)
  if (!norm.success || norm.data == null) return { success: false, error: norm.error ?? '유효하지 않은 값' }
  const nextVal = norm.data

  const wantNum = (k: string) => (k === key ? Number(nextVal) : null)
  const readNum = async (k: string) => {
    if (k === key) return Number(nextVal)
    const meta = POLICY_SETTING_DEFAULTS[k]
    const fallback = meta ? Number(meta.value) : 0
    const { data } = await supabase.from('admin_settings').select('value').eq('key', k).maybeSingle()
    const raw = data?.value != null ? Number((data as any).value) : fallback
    return Number.isFinite(raw) ? raw : fallback
  }

  let hasConflict = false
  let message: string | null = null

  // 규칙 1) rfq_open_duration_hours < delivery_signal_window
  if (key === 'rfq_open_duration_hours' || key === 'delivery_signal_window') {
    const rfqOpenH = await readNum('rfq_open_duration_hours')
    const deliveryWinDays = await readNum('delivery_signal_window')
    // units mismatch in rule text, but intent is "window must not exceed open time"
    if (Number.isFinite(rfqOpenH) && Number.isFinite(deliveryWinDays) && rfqOpenH < deliveryWinDays) {
      hasConflict = true
      message = '입찰 공개 시간이 납기 윈도우보다 짧습니다'
    }
  }

  // 규칙 2~3) trust supplier thresholds ordering
  if (!hasConflict && (key === 'trust_supplier_level1' || key === 'trust_supplier_level2' || key === 'trust_supplier_level3')) {
    const l1 = await readNum('trust_supplier_level1')
    const l2 = await readNum('trust_supplier_level2')
    const l3 = await readNum('trust_supplier_level3')
    if (l3 > l2) {
      hasConflict = true
      message = 'Level3 기준이 Level2보다 높습니다'
    } else if (l2 > l1) {
      hasConflict = true
      message = 'Level2 기준이 Level1보다 높습니다'
    }
  }

  // 규칙 4) settlement_cycle_days < 7
  if (!hasConflict && key === 'settlement_cycle_days') {
    const n = wantNum(key) ?? Number(nextVal)
    if (Number.isFinite(n) && n < 7) {
      hasConflict = true
      message = '정산 주기가 너무 짧습니다 (최소 7일)'
    }
  }

  // 규칙 5) order_cycle_calculation_count < 2
  if (!hasConflict && key === 'order_cycle_calculation_count') {
    const n = wantNum(key) ?? Number(nextVal)
    if (Number.isFinite(n) && n < 2) {
      hasConflict = true
      message = '주문주기 계산 기준이 너무 낮습니다 (최소 2건)'
    }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'policy_conflict_check',
    target_table: 'admin_settings',
    target_id: key,
    new_value: { key, new_value: nextVal, hasConflict, message },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true, data: { hasConflict, message } }
}

export async function getPolicyImpactPreview(
  key: string,
  newValue: string,
): Promise<ActionResult<{ count: number; message: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!key?.trim()) return { success: false, error: 'key가 올바르지 않습니다.' }
  if (!(key in POLICY_SETTING_DEFAULTS)) return { success: false, error: '허용되지 않은 설정 키입니다.' }

  await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })

  const norm = normalizeNumericPolicyValue(key, newValue)
  if (!norm.success || norm.data == null) return { success: false, error: norm.error ?? '유효하지 않은 값' }
  const nextVal = norm.data

  let count = 0
  let message = ''

  // trust supplier thresholds: "현재 해당 Level인 공급자 수"
  if (key === 'trust_supplier_level1' || key === 'trust_supplier_level2' || key === 'trust_supplier_level3') {
    const level = key === 'trust_supplier_level1' ? 1 : key === 'trust_supplier_level2' ? 2 : 3
    const { count: c, error } = await supabase
      .from('trust_scores')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'supplier')
      .eq('level', level)
    if (error) return { success: false, error: error.message }
    count = c ?? 0
    message = `${count}명의 공급자 신뢰 등급이 변경될 수 있습니다`
  } else if (key === 'rfq_open_duration_hours') {
    const { count: c, error } = await supabase
      .from('rfq_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    if (error) return { success: false, error: error.message }
    count = c ?? 0
    message = `현재 진행 중인 발주요청 ${count}건에 즉시 적용됩니다`
  } else if (key === 'order_cycle_calculation_count') {
    const { count: c, error } = await supabase
      .from('customer_stats')
      .select('customer_id', { count: 'exact', head: true })
    if (error) return { success: false, error: error.message }
    count = c ?? 0
    message = `${count}개 거래처의 주문주기가 재계산됩니다`
  } else if (key === 'signal_suppression_days') {
    const { count: c, error } = await supabase
      .from('sales_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (error) return { success: false, error: error.message }
    count = c ?? 0
    message = `대기 중인 영업스케줄 ${count}건에 영향을 줍니다`
  } else {
    count = 0
    message = '영향 범위 미리보기 대상이 아닙니다'
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'policy_impact_preview',
    target_table: 'admin_settings',
    target_id: key,
    reason: 'policy preview',
    new_value: { key, new_value: nextVal, count, message },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true, data: { count, message } }
}
