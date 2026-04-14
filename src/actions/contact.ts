'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { updateActionConversion } from '@/actions/action-log'
import type { ConversionStatus } from '@/actions/action-log'
import type { ActionResult } from '@/types/order'

export type ContactMethod = 'call' | 'visit' | 'message' | 'payment'
export type ContactResult  = 'connected' | 'no_answer' | 'interested' | 'rejected' | 'scheduled'
export type NextActionType = 'call' | 'visit' | 'message'

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
  { value: 'regular', label: '단골' },
  { value: 'new',     label: '신규' },
  { value: 'churn',   label: '이탈' },
  { value: 'dormant', label: '휴면' },
] as const

export type CustomerStatusType = typeof CUSTOMER_STATUS_OPTIONS[number]['value']

export interface CreateContactLogInput {
  customer_id:        string
  contact_method:     ContactMethod
  memo?:              string
  action_log_id?:     string
  conversion_status?: ConversionStatus
  result?:            ContactResult
  next_action_date?:  string
  next_action_type?:  NextActionType
  outcome_type?:      OutcomeType
  customer_status?:   CustomerStatusType
  schedule_id?:       string | null
  methods?:           string[]
}

export async function createContactLog(
  input: CreateContactLogInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServer()
    const ctx      = await getAuthCtx(supabase)
    if (!ctx) return { success: false, error: '로그인 필요' }

    // ── 거래처 존재 확인 ────────────────────────────────────
    const { data: customer, error: custCheckErr } = await supabase
      .from('customers')
      .select('id')
      .is('deleted_at', null)
      .eq('id', input.customer_id)
      .eq('tenant_id', ctx.tenant_id)
      .single()

    if (custCheckErr || !customer) {
      console.error('[createContactLog] customer check error:', custCheckErr)
      return { success: false, error: custCheckErr?.message ?? '유효하지 않은 거래처' }
    }

    // ── insert payload ────────────────────────────────────────
    const payload = {
      tenant_id:        ctx.tenant_id,
      customer_id:      input.customer_id,
      contact_method:   input.contact_method,
      memo:             input.memo              ?? null,
      contacted_by:     ctx.user_id             ?? null,
      contacted_at:     new Date().toISOString(),
      action_log_id:    input.action_log_id     ?? null,
      outcome_type:     input.outcome_type      ?? null,
      customer_status:  input.customer_status   ?? null,
      next_action_date: input.next_action_date  ?? null,
      next_action_type: input.next_action_type  ?? null,
      schedule_id:      input.schedule_id       ?? null,
      methods:          input.methods           ?? null,
      // 레거시 — 기존 코드 호환
      outcome:          input.result ?? input.outcome_type ?? null,
      result:           input.result ?? input.outcome_type ?? null,
    }

      ...payload,
      memo: payload.memo?.slice(0, 30),
    }))

    // ── insert ────────────────────────────────────────────────
    const { data, error: insertErr } = await supabase
      .from('contact_logs')
      .insert(payload)
      .select('id')
      .single()

    if (insertErr || !data) {
      console.error('[createContactLog] insert error:', insertErr)
      return {
        success: false,
        error:   `INSERT 실패: ${insertErr?.message ?? 'unknown'} (code: ${insertErr?.code ?? '-'})`,
      }
    }


    // ── customers 동기화 (실패해도 이력 저장은 유지) ──────────
    try {
      const custUpdate: Record<string, string | null> = {
        last_contact_date: new Date().toISOString(),
      }
      if (input.outcome_type)    custUpdate.last_contact_outcome = input.outcome_type
      if (input.customer_status) custUpdate.sales_status         = input.customer_status

      const { error: custErr } = await supabase
        .from('customers')
        .update(custUpdate)
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenant_id)

      if (custErr) console.error('[createContactLog] customers sync error:', custErr.message)
    } catch (syncErr) {
      console.error('[createContactLog] customers sync exception:', syncErr)
    }

    // ── action_log conversion (레거시) ────────────────────────
    if (input.action_log_id && input.conversion_status) {
      await updateActionConversion(input.action_log_id, input.conversion_status, data.id)
    }

    revalidatePath('/customers')
    return { success: true, data: { id: data.id } }

  } catch (e: any) {
    console.error('[createContactLog] unexpected error:', e)
    return {
      success: false,
      error:   `예외 발생: ${e?.message ?? 'UNKNOWN_ERROR'}`,
    }
  }
}