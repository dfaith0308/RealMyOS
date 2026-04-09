'use server'

// ============================================================
// RealMyOS - Contact Log
// src/actions/contact.ts
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import { updateActionConversion } from '@/actions/action-log'
import type { ConversionStatus } from '@/actions/action-log'
import type { ActionResult } from '@/types/order'

// call_attempt = 전화 버튼 클릭 (통화 성공 여부 불명)
// call         = 실제 통화 확인 (수동 기록)
// payment      = 수금 완료 (자동 기록)
export type ContactMethod = 'call' | 'call_attempt' | 'visit' | 'message' | 'payment'

export interface CreateContactLogInput {
  customer_id: string
  contact_method: ContactMethod
  memo?: string
  action_log_id?: string
  // 이 연락이 action_log의 conversion에 해당하는 상태
  // call_attempt → 'attempt', payment → 'success'
  conversion_status?: ConversionStatus
}

export async function createContactLog(
  input: CreateContactLogInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const { data: customer } = await supabase
    .from('customers').select('id')
    .is('deleted_at', null)
    .eq('id', input.customer_id)
    .eq('tenant_id', me.tenant_id)
    .single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처' }

  const { data, error } = await supabase
    .from('contact_logs')
    .insert({
      tenant_id:      me.tenant_id,
      customer_id:    input.customer_id,
      contact_method: input.contact_method,
      memo:           input.memo ?? null,
      contacted_by:   user.id,
      contacted_at:   new Date().toISOString(),
      action_log_id:  input.action_log_id ?? null,
      outcome:        input.outcome ?? null,
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
