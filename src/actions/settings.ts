'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_SETTINGS, type TenantSettings } from '@/constants/settings'
import type { ActionResult } from '@/types/order'

export type CompanyProfile = {
  name: string
  representative_name: string
  contact_phone: string
}

/** 거래명세서용 도장·입금계좌 */
export type StatementProfile = {
  stamp_image_url: string
  bank_name: string
  bank_account: string
  bank_holder: string
}

const STATEMENT_SETTING_KEYS = {
  stamp_image_url: 'stamp_image_url',
  bank_name: 'statement_bank_name',
  bank_account: 'statement_bank_account',
  bank_holder: 'statement_bank_holder',
} as const

async function upsertStatementSettings(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  tenantId: string,
  values: StatementProfile,
) {
  const now = new Date().toISOString()
  const rows = (Object.keys(STATEMENT_SETTING_KEYS) as (keyof typeof STATEMENT_SETTING_KEYS)[]).map(
    (k) => ({
      tenant_id: tenantId,
      key: STATEMENT_SETTING_KEYS[k],
      value: values[k] ?? '',
      updated_at: now,
    }),
  )
  await supabase.from('settings').upsert(rows, { onConflict: 'tenant_id,key' })
}

export async function getCompanyProfile(): Promise<ActionResult<CompanyProfile>> {
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('tenants')
    .select('name, representative_name, contact_phone')
    .eq('id', ctx.tenant_id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: '회사 정보를 찾을 수 없습니다' }

  return {
    success: true,
    data: {
      name: data.name ?? '',
      representative_name: data.representative_name ?? '',
      contact_phone: data.contact_phone ?? '',
    },
  }
}

export async function updateCompanyProfile(input: {
  name: string
  representative_name?: string
  contact_phone?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const name = input.name.trim()
  if (!name) return { success: false, error: '회사명을 입력해 주세요' }

  const { error } = await supabase
    .from('tenants')
    .update({
      name,
      representative_name: input.representative_name?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
    })
    .eq('id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  return { success: true }
}

export async function getStatementProfile(): Promise<ActionResult<StatementProfile>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx?.tenant_id) return { success: false, error: '로그인 필요' }

  const [{ data: tenant }, { data: settingsRows }] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', ctx.tenant_id).maybeSingle(),
    supabase
      .from('settings')
      .select('key, value')
      .eq('tenant_id', ctx.tenant_id)
      .in('key', Object.values(STATEMENT_SETTING_KEYS)),
  ])

  const map = new Map((settingsRows ?? []).map((r: any) => [r.key as string, String(r.value ?? '')]))
  const t: any = tenant ?? {}

  return {
    success: true,
    data: {
      stamp_image_url: String(t.stamp_image_url ?? map.get('stamp_image_url') ?? ''),
      bank_name: String(t.bank_name ?? map.get('statement_bank_name') ?? ''),
      bank_account: String(t.bank_account ?? map.get('statement_bank_account') ?? ''),
      bank_holder: String(t.bank_holder ?? map.get('statement_bank_holder') ?? ''),
    },
  }
}

export async function updateStatementProfile(input: {
  bank_name?: string
  bank_account?: string
  bank_holder?: string
  stamp_image_url?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx?.tenant_id) return { success: false, error: '로그인 필요' }

  const values: StatementProfile = {
    stamp_image_url: (input.stamp_image_url ?? '').trim(),
    bank_name: (input.bank_name ?? '').trim(),
    bank_account: (input.bank_account ?? '').trim(),
    bank_holder: (input.bank_holder ?? '').trim(),
  }

  // tenants 컬럼이 있으면 우선 저장 (마이그레이션 적용 전엔 settings로 fallback)
  const { error: tenantErr } = await supabase
    .from('tenants')
    .update({
      stamp_image_url: values.stamp_image_url || null,
      bank_name: values.bank_name || null,
      bank_account: values.bank_account || null,
      bank_holder: values.bank_holder || null,
    })
    .eq('id', ctx.tenant_id)

  if (tenantErr) {
    console.warn('[updateStatementProfile] tenants update fallback to settings:', tenantErr.message)
  }

  await upsertStatementSettings(supabase, ctx.tenant_id, values)

  revalidatePath('/settings')
  return { success: true }
}

export async function uploadTenantStamp(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx?.tenant_id) return { success: false, error: '로그인 필요' }

  const raw = formData.get('file')
  if (!raw || !(raw instanceof File)) return { success: false, error: '파일이 없습니다' }
  if (raw.size === 0) return { success: false, error: '빈 파일입니다' }
  if (raw.size > 2 * 1024 * 1024) return { success: false, error: '도장 이미지는 2MB 이하만 업로드할 수 있습니다' }

  const mime = raw.type || 'application/octet-stream'
  if (!/^image\/(jpeg|png|webp)$/i.test(mime)) {
    return { success: false, error: 'JPG/PNG/WEBP만 업로드할 수 있습니다' }
  }

  const admin = await createSupabaseAdmin()
  try {
    await admin.storage.createBucket('tenant-assets', {
      public: true,
      fileSizeLimit: 2097152,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
  } catch {
    // 이미 있으면 무시
  }

  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `${ctx.tenant_id}/stamp_${Date.now()}.${ext}`
  const buf = Buffer.from(await raw.arrayBuffer())

  const { data, error } = await admin.storage.from('tenant-assets').upload(path, buf, {
    contentType: mime,
    upsert: true,
  })

  if (error) {
    const msg = error.message ?? String(error)
    if (/bucket not found|Bucket not found/i.test(msg)) {
      return {
        success: false,
        error: 'tenant-assets 버킷이 없습니다. Supabase에서 마이그레이션(SQL)을 적용해주세요.',
      }
    }
    return { success: false, error: `업로드 실패: ${msg}` }
  }

  const { data: pub } = admin.storage.from('tenant-assets').getPublicUrl(data.path)
  const url = pub.publicUrl

  await updateStatementProfile({ stamp_image_url: url })
  return { success: true, data: { url } }
}

export async function getSettings(): Promise<ActionResult<TenantSettings>> {
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', ctx.tenant_id)

  const existing = new Map((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))

  // 누락된 키 자동 insert
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof TenantSettings)[]
  const missing = keys.filter((k) => !existing.has(k))
  if (missing.length > 0) {
    await supabase.from('settings').upsert(
      missing.map((k) => ({
        tenant_id:  ctx.tenant_id,
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

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

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

  const entries = Object.entries(input).filter(([, value]) => value !== undefined)
  if (entries.length === 0) return { success: true }

  const keys = entries.map(([key]) => key)
  const { data: existingRows } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', ctx.tenant_id)
    .in('key', keys)

  const oldMap = new Map((existingRows ?? []).map((r: any) => [r.key as string, r.value as string]))

  const rows = entries.map(([key, value]) => ({
    tenant_id:  ctx.tenant_id,
    key,
    value:      String(value),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'tenant_id,key' })

  if (error) return { success: false, error: `저장 실패: ${error.message}` }

  const logRows = rows
    .map((r) => ({
      tenant_id:   ctx.tenant_id,
      key:         r.key,
      old_value:   oldMap.get(r.key) ?? null,
      new_value:   r.value,
      changed_by:  ctx.user_id,
    }))
    .filter((r) => r.old_value !== r.new_value)

  if (logRows.length > 0) {
    try {
      await supabase
        .from('settings_logs')
        .insert(logRows)
    } catch {
      // best-effort: settings 저장은 성공, logs 실패는 무시
    }
  }

  revalidatePath('/settings')
  revalidatePath('/customers')

  return { success: true }
}

function parseNum(val: string | undefined, fallback: number): number {
  if (val === undefined) return fallback
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}
