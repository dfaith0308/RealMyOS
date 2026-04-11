'use server'

// ============================================================
// RealMyOS - Contact Log
// src/actions/contact.ts
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { updateActionConversion } from '@/actions/action-log'
import type { ConversionStatus } from '@/actions/action-log'
import type { ActionResult } from '@/types/order'

// call_attempt = 전화 버튼 클릭 (통화 성공 여부 불명)
// call         = 실제 통화 확인 (수동 기록)
// payment      = 수금 완료 (자동 기록)
export type ContactMethod = 'call' | 'call_attempt' | 'visit' | 'message' | 'payment'

export type ContactResult = 'connected' | 'no_answer' | 'interested' | 'rejected' | 'scheduled'
export type NextActionType = 'call' | 'visit' | 'message'

export interface CreateContactLogInput {
  customer_id:       string
  contact_method:    ContactMethod
  memo?:             string
  action_log_id?:    string
  conversion_status?: ConversionStatus
  // 영업이력 확장 필드
  result?:           ContactResult
  next_action_date?: string        // YYYY-MM-DD
  next_action_type?: NextActionType
}

export async function createContactLog(
  input: CreateContactLogInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: customer } = await supabase
    .from('customers').select('id')
    .is('deleted_at', null)
    .eq('id', input.customer_id)
    .eq('tenant_id', ctx.tenant_id)
    .single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처' }

  const { data, error } = await supabase
    .from('contact_logs')
    .insert({
      tenant_id:        ctx.tenant_id,
      customer_id:      input.customer_id,
      contact_method:   input.contact_method,
      memo:             input.memo ?? null,
      contacted_by:     ctx.user_id,           // 버그 수정: user.id → ctx.user_id
      contacted_at:     new Date().toISOString(),
      action_log_id:    input.action_log_id ?? null,
      outcome:          input.result ?? null,  // result → outcome 컬럼
      result:           input.result ?? null,
      next_action_date: input.next_action_date ?? null,
      next_action_type: input.next_action_type ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message }

  // action_log_id 있으면 conversion 업데이트
  if (input.action_log_id && input.conversion_status) {
    await updateActionConversion(
      input.action_log_id,
      input.conversion_status,
      data.id,
    )
  }

  revalidatePath('/customers')
  return { success: true, data: { id: data.id } }
}
