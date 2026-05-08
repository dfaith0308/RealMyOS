'use server'

import { revalidatePath } from 'next/cache'
import { smsByteLength } from '@/lib/sms-byte-length'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface AligoSettings {
  aligo_user_id: string
  aligo_api_key: string
  aligo_sender: string
}

function normalizePhoneDigits(phone: string): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

function isSafeNumber(receiverDigits: string): boolean {
  // PRODUCT: contact_status=safe_number 기반이 이상적이지만,
  // 현재 실행센터는 phone만 있으므로 050 계열을 안심번호로 간주(운영 관행).
  return receiverDigits.startsWith('050')
}

async function getSettingMap(keys: string[]): Promise<ActionResult<Map<string, string>>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요', data: new Map() }

  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', ctx.tenant_id)
    .in('key', keys)

  if (error) return { success: false, error: error.message, data: new Map() }
  const m = new Map<string, string>((data ?? []).map((r: any) => [r.key, r.value]))
  return { success: true, data: m }
}

export async function getAligoSettings(): Promise<ActionResult<Partial<AligoSettings>>> {
  const res = await getSettingMap(['aligo_user_id', 'aligo_api_key', 'aligo_sender'])
  if (!res.success) return { success: false, error: res.error ?? '조회 실패', data: {} }
  const m = res.data!
  return {
    success: true,
    data: {
      aligo_user_id: m.get('aligo_user_id') ?? '',
      aligo_api_key: m.get('aligo_api_key') ?? '',
      aligo_sender: m.get('aligo_sender') ?? '',
    },
  }
}

export async function saveAligoSettings(input: Partial<AligoSettings>): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const entries = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v ?? '').trim()] as const)

  if (entries.length === 0) return { success: true }

  const keys = entries.map(([k]) => k)
  const { data: existingRows } = await supabase
    .from('settings')
    .select('key, value')
    .eq('tenant_id', ctx.tenant_id)
    .in('key', keys)

  const oldMap = new Map((existingRows ?? []).map((r: any) => [r.key as string, r.value as string]))

  const rows = entries.map(([key, value]) => ({
    tenant_id: ctx.tenant_id,
    key,
    value,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'tenant_id,key' })

  if (error) return { success: false, error: `저장 실패: ${error.message}` }

  // settings_logs best-effort
  const logRows = rows
    .map((r) => ({
      tenant_id: ctx.tenant_id,
      key: r.key,
      old_value: oldMap.get(r.key) ?? null,
      new_value: r.value,
      changed_by: ctx.user_id,
    }))
    .filter((r) => r.old_value !== r.new_value)

  if (logRows.length > 0) {
    try {
      await supabase.from('settings_logs').insert(logRows)
    } catch {
      // ignore
    }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function sendAligo(input: {
  receiver: string
  msg: string
  customer_id: string
}): Promise<ActionResult<{ message_log_id: string; byte_len: number; sms_type: 'SMS' | 'LMS'; aligo_mid?: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const receiverDigits = normalizePhoneDigits(input.receiver)
  if (!receiverDigits) return { success: false, error: '수신번호가 필요합니다.' }

  const msg = (input.msg ?? '').trim()
  if (!msg) return { success: false, error: '메시지 내용이 비어있습니다.' }

  // settings load
  const settingsRes = await getAligoSettings()
  const s = settingsRes.data ?? {}
  const user_id = (s.aligo_user_id ?? '').trim()
  const key = (s.aligo_api_key ?? '').trim()
  const sender = normalizePhoneDigits(s.aligo_sender ?? '')

  if (!user_id || !key || !sender) {
    return { success: false, error: '알리고 설정이 필요합니다 → /settings' }
  }

  const byte_len = smsByteLength(msg)
  const sms_type: 'SMS' | 'LMS' = byte_len <= 90 ? 'SMS' : 'LMS'

  // 안심번호 정책: 050 계열 → SMS만 허용
  if (isSafeNumber(receiverDigits) && sms_type !== 'SMS') {
    return { success: false, error: '안심번호 대상은 단문(SMS, 90바이트)만 발송 가능합니다.' }
  }

  // aligo send
  const form = new FormData()
  form.set('key', key)
  form.set('user_id', user_id)
  form.set('sender', sender)
  form.set('receiver', receiverDigits)
  form.set('msg', msg)
  if (sms_type === 'LMS') {
    form.set('title', '식식이OS')
  }

  let aligo_response: any = null
  let status: 'sent' | 'failed' = 'failed'
  let mid: string | undefined
  try {
    const res = await fetch('https://apis.aligo.in/send/', { method: 'POST', body: form })
    const ct = res.headers.get('content-type') ?? ''
    const json = ct.includes('application/json') ? await res.json() : await res.text()
    aligo_response = json

    const result_code = typeof json === 'object' ? String((json as any)?.result_code ?? '') : ''
    if (result_code === '1') {
      status = 'sent'
      mid = (json as any)?.msg_id ?? (json as any)?.mid ?? undefined
    } else {
      status = 'failed'
    }
  } catch (e: any) {
    aligo_response = { error: e?.message ?? 'FETCH_ERROR' }
    status = 'failed'
  }

  // message_logs insert (always)
  const { data: msgLog, error: msgErr } = await supabase
    .from('message_logs')
    .insert({
      tenant_id: ctx.tenant_id,
      customer_id: input.customer_id,
      channel: 'sms',
      content: msg,
      status,
      aligo_response,
      sent_at: new Date().toISOString(),
      created_by: ctx.user_id,
    })
    .select('id')
    .single()

  if (msgErr || !msgLog) {
    return { success: false, error: `message_logs 저장 실패: ${msgErr?.message ?? 'unknown'}` }
  }

  revalidatePath('/sales/exec')
  return {
    success: status === 'sent',
    error: status === 'sent' ? undefined : (typeof aligo_response === 'object' ? ((aligo_response as any)?.message ?? (aligo_response as any)?.result_message) : '발송 실패'),
    data: { message_log_id: msgLog.id, byte_len, sms_type, aligo_mid: mid },
  }
}

export async function sendAligoTest(): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const sRes = await getAligoSettings()
  const sender = normalizePhoneDigits(sRes.data?.aligo_sender ?? '')
  if (!sender) return { success: false, error: '발신번호(aligo_sender) 설정이 필요합니다.' }

  const { data: cust } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_buyer', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!cust?.id) return { success: false, error: '테스트 발송을 위해 거래처(매출처) 1건이 필요합니다.' }

  const r = await sendAligo({
    receiver: sender,
    msg: '식식이OS 알리고 연동 테스트',
    customer_id: cust.id,
  })
  return r.success ? { success: true } : { success: false, error: r.error ?? '테스트 발송 실패' }
}

