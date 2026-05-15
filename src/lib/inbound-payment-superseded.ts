/**
 * Inbound append-only reversal ([D-024]): 원본 `payments` 행은 `confirmed` 로 남고
 * `reversal_of_id` 가 원본을 가리키는 상쇅 row가 생긴 경우, 원본 id는 미수·원장 집계에서 제외한다.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** `payments.type` taxonomy — `PAYMENTS-TAXONOMY-DESIGN-001` §3.2 `payout_reversal` */
export const PAYMENTS_TYPE_PAYOUT_REVERSAL = 'payout_reversal' as const

/** 실제 공급자 지급(outbound) — `PAYMENTS-TAXONOMY-DESIGN-001` `payout_outbound` */
export const PAYMENTS_TYPE_PAYOUT_OUTBOUND = 'payout_outbound' as const

/**
 * @param tenantPayeeScope `payee_tenant_id.eq.{tid},tenant_id.eq.{tid}` (inbound 수금 테넌트)
 */
export async function fetchInboundSupersededOriginalPaymentIds(
  supabase: SupabaseClient,
  tenantPayeeScope: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('reversal_of_id')
    .eq('direction', 'inbound')
    .eq('status', 'reversed')
    .not('reversal_of_id', 'is', null)
    .or(tenantPayeeScope)

  if (error || !data?.length) return []
  const ids = (data as { reversal_of_id: string | null }[])
    .map((r) => String(r.reversal_of_id ?? '').trim())
    .filter(Boolean)
  return [...new Set(ids)]
}

/** 관리자 통합 정산 등: `candidateOriginalPaymentIds` 중 append-only 상쇅로 무효화된 원본 id */
export async function fetchInboundSupersededSubset(
  supabase: SupabaseClient,
  candidateOriginalPaymentIds: string[],
): Promise<string[]> {
  const ids = [...new Set(candidateOriginalPaymentIds.filter(Boolean))]
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('payments')
    .select('reversal_of_id')
    .in('reversal_of_id', ids)
    .eq('direction', 'inbound')
    .eq('status', 'reversed')

  if (error || !data?.length) return []
  return [
    ...new Set(
      (data as { reversal_of_id: string | null }[])
        .map((r) => String(r.reversal_of_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
}
