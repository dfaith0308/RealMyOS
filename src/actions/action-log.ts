'use server'

// ============================================================
// RealMyOS - Action Log
// src/actions/action-log.ts
// ============================================================

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { CustomerStatus } from '@/actions/ledger'

export type ActionType = 'call' | 'collect' | 'order'
export type ConversionStatus = 'unknown' | 'attempt' | 'success' | 'fail'
export type ResultType = 'none' | 'order_created' | 'payment_completed'

export interface LogActionInput {
  customer_id: string
  action_type: ActionType
  triggered_message?: string
  message_key?: string
  message_template_id?: string   // 선택한 템플릿 id (선택 옵션 — 강제 아님)
  customer_status?: CustomerStatus
  score_at_time?: number
  amount_at_time?: number
}

// ============================================================
// 버튼 클릭 기록 → action_log_id 반환
// ============================================================

export async function logAction(
  input: LogActionInput,
): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const ctx = await getAuthCtx(supabase)
    if (!ctx) return null

    const { data, error } = await supabase
      .from('action_logs')
      .insert({
        tenant_id:         ctx.tenant_id,
        customer_id:       input.customer_id,
        action_type:       input.action_type,
        triggered_message: input.triggered_message ?? null,
        message_key:       input.message_key ?? null,
        customer_status:   input.customer_status ?? null,
        score_at_time:     input.score_at_time ?? null,
        amount_at_time:    input.amount_at_time ?? null,
        conversion_status:    'unknown',
        result_type:          'none',
        message_template_id:  input.message_template_id ?? null,
      })
      .select('id')
      .single()

    if (error || !data) return null
    return data.id
  } catch {
    return null
  }
}

// ============================================================
// conversion_status 업데이트
// ============================================================

export async function updateActionConversion(
  action_log_id: string,
  status: ConversionStatus,
  contact_log_id?: string,
): Promise<void> {
  try {
    const supabase = await createSupabaseServer()
    await supabase
      .from('action_logs')
      .update({
        conversion_status: status,
        ...(contact_log_id ? { contact_log_id } : {}),
      })
      .eq('id', action_log_id)
  } catch {}
}

// ============================================================
// 결과 자동 연결
// 주문/수금 생성 후 호출 — 24시간 이내 같은 거래처 최근 action_log에 연결
// 실패해도 주문/수금에 영향 없음 (fire-and-forget)
// ============================================================

export async function linkActionResult(input: {
  customer_id: string
  tenant_id: string
  result_type: ResultType
  result_amount: number
  related_order_id?: string
  related_payment_id?: string
}): Promise<void> {
  try {
    const supabase = await createSupabaseServer()

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // 24시간 이내 같은 거래처의 가장 최근 action_log 1건
    // result_type = 'none'인 것만 (이미 연결된 건 재연결 안 함)
    const { data: target } = await supabase
      .from('action_logs')
      .select('id')
      .eq('tenant_id', input.tenant_id)
      .eq('customer_id', input.customer_id)
      .eq('result_type', 'none')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!target) return  // 연결할 action_log 없음 — 정상

    await supabase
      .from('action_logs')
      .update({
        result_type:          input.result_type,
        result_amount:        input.result_amount,
        result_at:            new Date().toISOString(),
        related_order_id:     input.related_order_id ?? null,
        related_payment_id:   input.related_payment_id ?? null,
        conversion_status:    'success',
      })
      .eq('id', target.id)
  } catch {
    // 조용히 무시 — 결과 연결 실패는 주문/수금에 영향 없음
  }
}
