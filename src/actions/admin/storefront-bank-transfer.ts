'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import {
  STOREFRONT_BANK_TRANSFER_SETTINGS_KEY,
  parseStorefrontBankTransferJson,
  serializeStorefrontBankTransferSettings,
  validateStorefrontBankTransferInput,
  type StorefrontBankTransferSettings,
} from '@/lib/storefront-bank-transfer'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

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
    old_value?: unknown
    new_value?: unknown
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('admin_logs').insert({
    admin_tenant_id: PLATFORM_OWNER_TENANT,
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getStorefrontBankTransferSettingsAdmin(): Promise<
  ActionResult<{ raw: string | null; parsed: StorefrontBankTransferSettings | null }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', STOREFRONT_BANK_TRANSFER_SETTINGS_KEY)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  const raw = (data as { value?: string } | null)?.value ?? null
  return { success: true, data: { raw, parsed: parseStorefrontBankTransferJson(raw) } }
}

export async function updateStorefrontBankTransferSettings(input: {
  bank_name: string
  account_number: string
  account_holder: string
  notice: string
}): Promise<ActionResult> {
  const v = validateStorefrontBankTransferInput(input)
  if (v) return { success: false, error: v }

  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: beforeRow } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', STOREFRONT_BANK_TRANSFER_SETTINGS_KEY)
    .maybeSingle()

  const value = serializeStorefrontBankTransferSettings(input)
  const nowIso = new Date().toISOString()

  const { error } = await supabase.from('admin_settings').upsert(
    {
      key: STOREFRONT_BANK_TRANSFER_SETTINGS_KEY,
      value,
      description: 'storefront 무통장 입금 계좌·안내 (식당OS 체크아웃)',
      updated_at: nowIso,
      updated_by: auth.ctx.user_id,
    },
    { onConflict: 'key' },
  )

  if (error) return { success: false, error: error.message }

  const { data: settingRow } = await supabase
    .from('admin_settings')
    .select('id')
    .eq('key', STOREFRONT_BANK_TRANSFER_SETTINGS_KEY)
    .maybeSingle()

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'storefront_bank_transfer_updated',
    target_table: 'admin_settings',
    target_id: settingRow?.id ?? null,
    reason: STOREFRONT_BANK_TRANSFER_SETTINGS_KEY,
    old_value: beforeRow ? { value: (beforeRow as { value?: string }).value } : null,
    new_value: { key: STOREFRONT_BANK_TRANSFER_SETTINGS_KEY, value },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/commerce/storefront-bank')
  return { success: true }
}
