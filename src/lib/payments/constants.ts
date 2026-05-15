/** `insertOutboundReversal` 차단 시 메시지 — `cancelDisbursement`가 legacy RPC로 우회하지 않도록 동일 값으로 비교 */
export const PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR =
  'payout_outbound는 자동 reversal 불가. 수동 처리 필요.' as const
