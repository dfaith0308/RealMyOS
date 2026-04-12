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

// call    = 전화
// visit   = 방문
// message = 문자 / 카카오 등
// payment = 수금 완료 (자동 기록)
export type ContactMethod = 'call' | 'visit' | 'message' | 'payment'

export type ContactResult = 'connected' | 'no_answer' | 'interested' | 'rejected' | 'scheduled'
export type NextActionType = 'call' | 'visit' | 'message'

// CRM 결과 타입 (outcome_type)
export const OUTCOME_TYPES = [
  { value: 'interested',         label: '관심있음' },
  { value: 'potential',          label: '잠재고객' },
  { value: 'maintained',         label: '관계유지' },
  { value: 'churn_risk',         label: '이탈위험' },
  { value: 'competitor',         label: '경쟁사사용' },
  { value: 'rejected',           label: '거절' },
  { value: 'no_answer',          label: '부재중' },
  { value: 'callback_requested', label: '콜백요청' },
  { value: 'order_placed',       label: '주문성사' },
] as const

export type OutcomeType = typeof OUTCOME_TYPES[number]['value']

export const CUSTOMER_STATUS_OPTIONS = [
  { value: 'regular',   label: '단골' },
  { value: 'new',       label: '신규' },
  { value: 'churn',     label: '이탈' },
  { value: 'dormant',   label: '휴면' },
] as const

export type CustomerStatusType = typeof CUSTOMER_STATUS_OPTIONS[number]['value']

// next_action_date 자동 계산 (추천값)
export interface CreateContactLogInput {
  customer_id:       string
  contact_method:    ContactMethod
  memo?:             string
  action_log_id?:    string
  conversion_status?: ConversionStatus
  result?:           ContactResult
  next_action_date?: string
  next_action_type?: NextActionType
  // CRM 확장 필드
  outcome_type?:     OutcomeType
  customer_status?:  CustomerStatusType
  schedule_id?:      string | null   // 스케줄 연결
  methods?:          string[]        // 실제 행동 배열
}

export async function createContactLog(
  input: CreateContactLogInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()

  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  console.log('[CONTACT_LOG INPUT]', {
    customer_id:    input.customer_id,
    contact_method: input.contact_method,
    outcome_type:   input.outcome_type,
    methods:        input.methods,
    memo:           input.memo?.slice(0, 20),
    schedule_id:    input.schedule_id,
  })

  const { data: customer } = await supabase
    .from('customers').select('id')
    .is('deleted_at', null)
    .eq('id', input.customer_id)
    .eq('tenant_id', ctx.tenant_id)
    .single()
  if (!customer) return { success: false, error: '유효하지 않은 거래처' }

  const insertPayload = {
    tenant_id:        ctx.tenant_id,
    customer_id:      input.customer_id,
    contact_method:   input.contact_method,
    memo:             input.memo ?? null,
    contacted_by:     ctx.user_id ?? null,
    contacted_at:     new Date().toISOString(),
    action_log_id:    input.action_log_id ?? null,
    outcome:          input.result ?? input.outcome_type ?? null,
    result:           input.result ?? input.outcome_type ?? null,
    next_action_date: input.next_action_date ?? null,
    next_action_type: input.next_action_type ?? null,
    outcome_type:     input.outcome_type     ?? null,
    customer_status:  input.customer_status  ?? null,
    schedule_id:      input.schedule_id      ?? null,
    methods:          input.methods          ?? null,
  }
  console.log('[CONTACT_LOG PAYLOAD]', JSON.stringify(insertPayload))

  const { data, error } = await supabase
    .from('contact_logs')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !data) {
    console.error('[CONTACT_LOG SUPABASE ERROR]', error)
    return { success: false, error: error?.message }
  }

  // customers 동기화 — 실패해도 contact_log 저장은 완료된 것으로 처리
  try {
    const custUpdate: Record<string, any> = {
      last_contact_date: new Date().toISOString(),
    }
    if (input.outcome_type)    custUpdate.last_contact_outcome = input.outcome_type
    if (input.customer_status) custUpdate.sales_status          = input.customer_status
    // customer_status 없으면 sales_status 업데이트 안 함

    const { error: custErr } = await supabase
      .from('customers')
      .update(custUpdate)
      .eq('id', input.customer_id)
      .eq('tenant_id', ctx.tenant_id)

    if (custErr) console.error('[CONTACT] customers 동기화 실패:', custErr.message)
  } catch (syncErr) {
    console.error('[CONTACT] customers 동기화 예외 (contact_log는 저장됨):', syncErr)
  }

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
