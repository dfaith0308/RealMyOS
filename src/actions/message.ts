'use server'

import { revalidatePath } from 'next/cache'
import { SolapiMessageService } from 'solapi'
import { smsByteLength } from '@/lib/sms-byte-length'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'

/** @deprecated 알리고 → 솔라피 전환. 하위 호환용 타입 유지 */
export interface AligoSettings {
  aligo_user_id: string
  aligo_api_key: string
  aligo_sender: string
}

function normalizePhoneDigits(phone: string): string {
  return (phone ?? '').replace(/[^0-9]/g, '')
}

function kstDayStartIso(): { start: string; end: string } {
  const kstNow = new Date(Date.now() + 9 * 3600000)
  const y = kstNow.getUTCFullYear()
  const m = String(kstNow.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kstNow.getUTCDate()).padStart(2, '0')
  const day = `${y}-${m}-${d}`
  const start = new Date(`${day}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 3600000)
  return { start: start.toISOString(), end: end.toISOString() }
}

async function getSmsDailyLimit(): Promise<number> {
  try {
    const n = await getAdminSettingNumber('sms_daily_limit', { min: 1, max: 10000 })
    return Number.isFinite(n) && n > 0 ? n : 100
  } catch {
    return 100
  }
}

function getSolapiEnv(): { apiKey: string; apiSecret: string; sender: string } | null {
  const apiKey = (process.env.SOLAPI_API_KEY ?? '').trim()
  const apiSecret = (process.env.SOLAPI_API_SECRET ?? '').trim()
  const sender = normalizePhoneDigits(process.env.SOLAPI_SENDER ?? '')
  if (!apiKey || !apiSecret || !sender) return null
  return { apiKey, apiSecret, sender }
}

function createSolapiClient(apiKey: string, apiSecret: string) {
  return new SolapiMessageService(apiKey, apiSecret)
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

/** @deprecated 설정은 env(SOLAPI_*)로 이전. UI 하위 호환용 */
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

/** @deprecated 설정은 env(SOLAPI_*)로 이전 */
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

/**
 * SMS 발송 (함수명 유지: sendAligo)
 * 내부 구현: 솔라피(SOLAPI) API
 */
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

  const dailyLimit = await getSmsDailyLimit()
  const { start, end } = kstDayStartIso()

  const { count: sentTodayCount, error: countErr } = await supabase
    .from('message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenant_id)
    .eq('status', 'sent')
    .gte('sent_at', start)
    .lt('sent_at', end)

  if (!countErr && (sentTodayCount ?? 0) >= dailyLimit) {
    return { success: false, error: `일일 SMS 발송 한도(${dailyLimit}건)에 도달했습니다` }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: dup, error: dupErr } = await supabase
    .from('message_logs')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('status', 'sent')
    .eq('receiver', receiverDigits)
    .eq('content', msg)
    .gte('sent_at', oneHourAgo)
    .limit(1)
    .maybeSingle()

  if (!dupErr && dup?.id) {
    return { success: false, error: '같은 번호에 1시간 내 동일 내용 재발송은 차단됩니다' }
  }

  const solapiEnv = getSolapiEnv()
  if (!solapiEnv) {
    return {
      success: false,
      error: '솔라피 설정이 필요합니다 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER)',
    }
  }

  const byte_len = smsByteLength(msg)
  const sms_type: 'SMS' | 'LMS' = byte_len <= 90 ? 'SMS' : 'LMS'

  let provider_response: any = null
  let status: 'sent' | 'failed' = 'failed'
  let mid: string | undefined
  let errorMessage: string | undefined

  try {
    const solapi = createSolapiClient(solapiEnv.apiKey, solapiEnv.apiSecret)
    const result = await solapi.send({
      to: receiverDigits,
      from: solapiEnv.sender,
      text: msg,
      ...(sms_type === 'LMS' ? { subject: '식식이OS' } : {}),
    })

    provider_response = result
    const groupId = result?.groupInfo?.groupId
    const messageId =
      result?.messageList?.[0]?.messageId ??
      (result as any)?.messageId ??
      undefined

    mid = messageId || groupId || undefined

    const failedList = result?.failedMessageList ?? []
    if (mid && failedList.length === 0) {
      status = 'sent'
    } else if (mid && (result.groupInfo?.count?.registeredSuccess ?? 0) > 0) {
      status = 'sent'
    } else {
      status = 'failed'
      errorMessage =
        failedList[0]?.statusMessage ||
        (typeof (result as any)?.errorMessage === 'string'
          ? (result as any).errorMessage
          : '솔라피 발송 실패')
    }
  } catch (e: any) {
    provider_response = {
      provider: 'solapi',
      error: e?.message ?? 'FETCH_ERROR',
      errorCode: e?.errorCode ?? e?.code,
    }
    status = 'failed'
    errorMessage = e?.message ?? e?.errorMessage ?? '솔라피 발송 오류'
  }

  const sentAt = new Date().toISOString()
  const logPayload: Record<string, unknown> = {
    tenant_id: ctx.tenant_id,
    customer_id: input.customer_id,
    channel: 'sms',
    receiver: receiverDigits,
    content: msg,
    status,
    aligo_response: { provider: 'solapi', ...(typeof provider_response === 'object' ? provider_response : { raw: provider_response }) },
    sent_at: sentAt,
    created_by: ctx.user_id,
  }
  if (mid) logPayload.external_id = mid

  let msgLog: { id: string } | null = null
  let msgErr: { message?: string } | null = null

  {
    const r = await supabase.from('message_logs').insert(logPayload).select('id').single()
    msgLog = r.data
    msgErr = r.error
  }

  // external_id 컬럼이 없는 DB 대비 fallback
  if (msgErr && mid && /external_id/i.test(msgErr.message ?? '')) {
    const { external_id: _drop, ...withoutExternal } = logPayload
    const r2 = await supabase.from('message_logs').insert(withoutExternal).select('id').single()
    msgLog = r2.data
    msgErr = r2.error
  }

  if (msgErr || !msgLog) {
    return { success: false, error: `message_logs 저장 실패: ${msgErr?.message ?? 'unknown'}` }
  }

  revalidatePath('/sales/exec')
  return {
    success: status === 'sent',
    error: status === 'sent' ? undefined : (errorMessage ?? '발송 실패'),
    data: { message_log_id: msgLog.id, byte_len, sms_type, aligo_mid: mid },
  }
}

export async function sendAligoTest(): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const solapiEnv = getSolapiEnv()
  if (!solapiEnv) {
    return {
      success: false,
      error: '솔라피 설정이 필요합니다 (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER)',
    }
  }

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
    receiver: solapiEnv.sender,
    msg: '식식이OS 솔라피 연동 테스트',
    customer_id: cust.id,
  })
  return r.success ? { success: true } : { success: false, error: r.error ?? '테스트 발송 실패' }
}

/** 설정 화면용: 솔라피 env 구성 여부 (시크릿 값은 노출하지 않음) */
export async function getSolapiConfigStatus(): Promise<
  ActionResult<{ configured: boolean; hasSender: boolean; senderMasked: string | null }>
> {
  const ctx = await getAuthCtx(await createSupabaseServer())
  if (!ctx) return { success: false, error: '로그인 필요' }

  const apiKey = !!(process.env.SOLAPI_API_KEY ?? '').trim()
  const apiSecret = !!(process.env.SOLAPI_API_SECRET ?? '').trim()
  const sender = normalizePhoneDigits(process.env.SOLAPI_SENDER ?? '')
  const configured = apiKey && apiSecret && !!sender
  const senderMasked = sender
    ? `${sender.slice(0, 3)}${'*'.repeat(Math.max(0, sender.length - 7))}${sender.slice(-4)}`
    : null

  return {
    success: true,
    data: { configured, hasSender: !!sender, senderMasked },
  }
}
