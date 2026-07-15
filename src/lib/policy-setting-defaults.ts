/**
 * 정책 콘솔 시드 SSOT — `'use server'` 모듈(policy-console)에서는 객체 export 불가.
 * 런타임 계산은 DB 값 우선, 조회 전에는 ensure로 채움.
 */
export const POLICY_SETTING_DEFAULTS: Record<string, { value: string; description: string }> = {
  platform_fee_rate: { value: '3', description: '플랫폼 수수료율 (%)' },
  settlement_cycle_days: { value: '30', description: '정산 주기 (일)' },
  order_cycle_calculation_count: { value: '3', description: '주문 주기 계산 기준 건수' },
  signal_suppression_days: { value: '7', description: '신호 억제 기간 (일)' },
  rfq_repeat_limit: { value: '3', description: '발주요청 반복 제한 (회)' },
  delivery_signal_window: { value: '5', description: '납기 신호 윈도우 (일)' },
  rfq_open_duration_hours: { value: '24', description: '입찰 공개 시간 (시간)' },
  trust_update_cycle_days: { value: '7', description: '신뢰도 갱신 주기 (일)' },
  trust_supplier_level1: { value: '70', description: '공급자 Level 1 상한 (점수 이하)' },
  trust_supplier_level2: { value: '60', description: '공급자 Level 2 상한 (점수 이하)' },
  trust_supplier_level3: { value: '50', description: '공급자 Level 3 상한 (점수 이하)' },
  trust_restaurant_level1: { value: '60', description: '식당 Level 1 상한 (점수 이하)' },
  trust_restaurant_level2: { value: '50', description: '식당 Level 2 상한 (점수 이하)' },
  trust_restaurant_level3: { value: '40', description: '식당 Level 3 상한 (점수 이하)' },
  aligo_user_id: { value: '', description: '레거시 — 실발송은 SOLAPI_* 환경변수' },
  aligo_api_key: { value: '', description: '레거시 — 실발송은 SOLAPI_* 환경변수' },
  aligo_sender: { value: '', description: '레거시 — 실발송은 SOLAPI_SENDER 환경변수' },
}
