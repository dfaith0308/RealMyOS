'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import { DEFAULT_SETTINGS, type TenantSettings } from '@/constants/settings'
import type { ActionResult } from '@/types/order'

export async function getSettings(): Promise<ActionResult<TenantSettings>> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', me.tenant_id)

  const existing = new Map((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))

  // 누락된 키 자동 insert
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof TenantSettings)[]
  const missing = keys.filter((k) => !existing.has(k))
  if (missing.length > 0) {
    await supabase.from('settings').upsert(
      missing.map((k) => ({
        tenant_id:  me.tenant_id,
        key:        k,
        value:      String(DEFAULT_SETTINGS[k]),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'tenant_id,key' },
    )
    missing.forEach((k) => existing.set(k, String(DEFAULT_SETTINGS[k])))
  }

  // 모든 키를 DB 값으로 파싱 — DEFAULT 단독 사용 금지
  const settings: TenantSettings = {
    vat_rate:                  parseNum(existing.get('vat_rate'),                  DEFAULT_SETTINGS.vat_rate),
    order_edit_lock_days:      parseNum(existing.get('order_edit_lock_days'),      DEFAULT_SETTINGS.order_edit_lock_days),
    margin_warning_threshold:  parseNum(existing.get('margin_warning_threshold'),  DEFAULT_SETTINGS.margin_warning_threshold),
    new_customer_days:         parseNum(existing.get('new_customer_days'),         DEFAULT_SETTINGS.new_customer_days),
    overdue_warning_amount:    parseNum(existing.get('overdue_warning_amount'),    DEFAULT_SETTINGS.overdue_warning_amount),
    overdue_danger_amount:     parseNum(existing.get('overdue_danger_amount'),     DEFAULT_SETTINGS.overdue_danger_amount),
    warning_days:              parseNum(existing.get('warning_days'),              DEFAULT_SETTINGS.warning_days),
    danger_days:               parseNum(existing.get('danger_days'),               DEFAULT_SETTINGS.danger_days),
    warning_cycle_multiplier:  parseNum(existing.get('warning_cycle_multiplier'),  DEFAULT_SETTINGS.warning_cycle_multiplier),
    danger_cycle_multiplier:         parseNum(existing.get('danger_cycle_multiplier'),         DEFAULT_SETTINGS.danger_cycle_multiplier),
    default_target_monthly_revenue:  parseNum(existing.get('default_target_monthly_revenue'),  DEFAULT_SETTINGS.default_target_monthly_revenue),
  }

  return { success: true, data: settings }
}

export async function saveSettings(input: Partial<TenantSettings>): Promise<ActionResult> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  if (input.vat_rate !== undefined && (input.vat_rate < 0 || input.vat_rate > 100))
    return { success: false, error: '부가세율은 0~100 사이여야 합니다.' }
  if (input.margin_warning_threshold !== undefined && input.margin_warning_threshold < 0)
    return { success: false, error: '마진 경고 기준은 0 이상이어야 합니다.' }
  if (input.order_edit_lock_days !== undefined && input.order_edit_lock_days < 0)
    return { success: false, error: '수정 잠금 기간은 0 이상이어야 합니다.' }
  if (
    input.warning_days !== undefined &&
    input.danger_days  !== undefined &&
    input.warning_days >= input.danger_days
  ) return { success: false, error: '주의 기준일은 위험 기준일보다 작아야 합니다.' }
  if (
    input.warning_cycle_multiplier !== undefined &&
    input.danger_cycle_multiplier  !== undefined &&
    input.warning_cycle_multiplier >= input.danger_cycle_multiplier
  ) return { success: false, error: '주의 배수는 위험 배수보다 작아야 합니다.' }
  if (
    input.overdue_warning_amount !== undefined &&
    input.overdue_danger_amount  !== undefined &&
    input.overdue_warning_amount >= input.overdue_danger_amount
  ) return { success: false, error: '연체 경고 금액은 연체 위험 금액보다 작아야 합니다.' }

  const rows = Object.entries(input).map(([key, value]) => ({
    tenant_id:  me.tenant_id,
    key,
    value:      String(value),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'tenant_id,key' })

  if (error) return { success: false, error: `저장 실패: ${error.message}` }

  revalidatePath('/settings')
  revalidatePath('/customers')

  return { success: true }
}

function parseNum(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}
