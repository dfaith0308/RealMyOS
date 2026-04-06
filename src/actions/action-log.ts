'use server'

// ============================================================
// RealMyOS - Action Log
// src/actions/action-log.ts
// ============================================================

import { createSupabaseServer } from '@/lib/supabase-server'
import type { CustomerStatus } from '@/actions/ledger'

export type ActionType = 'call' | 'collect' | 'order'
export type ConversionStatus = 'unknown' | 'attempt' | 'success' | 'fail'

export interface LogActionInput {
  customer_id: string
  action_type: ActionType
  triggered_message?: string   // 실제 노출 문구 (가변)
  message_key?: string         // 분석용 고정 식별자 (불변)
  customer_status?: CustomerStatus
  score_at_time?: number       // 클릭 시점 긴급도 점수 스냅샷
  amount_at_time?: number      // 클릭 시점 미수금 스냅샷 (원)
}

// ============================================================
// 버튼 클릭 기록 → action_log_id 반환
// 스냅샷 값은 insert 후 절대 수정하지 않음
// ============================================================

export async function logAction(
  input: LogActionInput,
): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: me } = await supabase
      .from('users').select('tenant_id').eq('id', user.id).single()
    if (!me?.tenant_id) return null

    const { data, error } = await supabase
      .from('action_logs')
      .insert({
        tenant_id:         me.tenant_id,
        customer_id:       input.customer_id,
        action_type:       input.action_type,
        triggered_message: input.triggered_message ?? null,
        message_key:       input.message_key ?? null,
        customer_status:   input.customer_status ?? null,
        score_at_time:     input.score_at_time ?? null,    // 스냅샷
        amount_at_time:    input.amount_at_time ?? null,   // 스냅샷
        conversion_status: 'unknown',
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
// conversion_status 업데이트 + contact_log_id 연결
// action_logs는 상태 컬럼만 업데이트 (스냅샷 컬럼 수정 금지)
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
  } catch {
    // 조용히 무시
  }
}
