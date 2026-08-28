'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getSolapiEnv, sendSolapiText } from '@/lib/solapi-admin'
import type { ActionResult } from '@/types/order'

/** 발송 이력은 리드 타임라인에 이 태그로 남는다 */
export const SMS_NOTE_TAG = '문자발송'

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

/** 설정 화면과 동일하게, 시크릿은 노출하지 않고 구성 여부만 알려준다 */
export async function getLeadSmsConfigStatus(): Promise<ActionResult<{ configured: boolean }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  return { success: true, data: { configured: !!getSolapiEnv() } }
}

/**
 * 영업 리드에게 문자 발송.
 * 발송 자체는 기존과 같은 솔라피 경로(SOLAPI_* env · 같은 발신번호)를 쓰고,
 * 이력은 거래처가 없으므로 message_logs 대신 리드 타임라인 메모로 남긴다.
 */
export async function sendSalesLeadSms(input: {
  lead_id: string
  message: string
}): Promise<ActionResult<{ smsType: 'SMS' | 'LMS'; byteLen: number }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const message = (input.message ?? '').trim()
  if (!message) return { success: false, error: '메시지 내용이 비어있습니다' }
  if (message.length > 1000) return { success: false, error: '메시지가 너무 깁니다 (1000자 이하)' }

  const supabase = await createSupabaseAdmin()

  const { data: lead, error: leadErr } = await supabase
    .from('sales_leads')
    .select('id, company_name, phone')
    .eq('id', input.lead_id)
    .maybeSingle()

  if (leadErr) return { success: false, error: leadErr.message }
  if (!lead) return { success: false, error: '리드를 찾을 수 없습니다' }
  if (!lead.phone) return { success: false, error: '이 리드에 등록된 전화번호가 없습니다' }

  // 같은 리드에 1시간 내 동일 내용 재발송 차단 (기존 SMS 경로와 같은 안전장치)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: dup } = await supabase
    .from('sales_lead_notes')
    .select('id')
    .eq('lead_id', input.lead_id)
    .contains('tags', [SMS_NOTE_TAG])
    .gte('created_at', oneHourAgo)
    .ilike('body', `%${message.slice(0, 60)}%`)
    .limit(1)
    .maybeSingle()

  if (dup?.id) {
    return { success: false, error: '같은 리드에 1시간 내 동일 내용 재발송은 차단됩니다' }
  }

  const result = await sendSolapiText({ to: lead.phone, text: message })

  // 성공/실패 모두 타임라인에 남긴다 — 영업 이력이므로 실패도 기록이 필요하다
  const noteBody = result.ok
    ? `[문자 발송] ${message}`
    : `[문자 발송 실패] ${message}\n— 사유: ${result.error ?? '알 수 없음'}`

  const { error: noteErr } = await supabase.from('sales_lead_notes').insert({
    lead_id: input.lead_id,
    body: noteBody,
    tags: result.ok ? [SMS_NOTE_TAG] : [SMS_NOTE_TAG, '발송실패'],
    created_by: auth.ctx.user_id,
  })

  if (noteErr) {
    console.error('[sendSalesLeadSms] 타임라인 기록 실패', noteErr.message)
  }

  revalidatePath(`/admin/sales/leads/${input.lead_id}`)

  if (!result.ok) return { success: false, error: result.error ?? '발송 실패' }
  return { success: true, data: { smsType: result.smsType, byteLen: result.byteLen } }
}
