// ============================================================
// RealMyOS - 거래처 점수 + 행동 메시지 + 예상행동
// src/lib/customer-logic.ts
// ============================================================

import type { CustomerStatus } from '@/actions/ledger'

export type ActionType =
  | 'new_customer'
  | 'collect_payment'
  | 'visit'
  | 'call'
  | 'upsell'
  | 'maintain'

export interface ActionMessage {
  text: string
  urgency: 'high' | 'mid' | 'low'
  key: string
  action_type: ActionType
}

// ============================================================
// 주문주기
// ============================================================

export function calcOrderCycle(orderDates: string[]): number | null {
  if (orderDates.length < 2) return null
  const sorted = [...orderDates].sort()
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.floor(
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000
    )
    if (diff > 0) gaps.push(diff)
  }
  if (gaps.length === 0) return null
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
}

// ============================================================
// 상태 계산
// ============================================================

export function calcCustomerStatus(p: {
  overdue_amount: number
  days_since_order: number | null
  order_cycle_days: number | null
  is_new: boolean
  overdue_warning_amount: number
  overdue_danger_amount: number
  warning_cycle_multiplier: number
  danger_cycle_multiplier: number
  warning_days: number
  danger_days: number
}): CustomerStatus {
  if (p.overdue_amount >= p.overdue_danger_amount)  return 'danger'
  if (p.overdue_amount >= p.overdue_warning_amount) return 'warning'
  if (p.days_since_order !== null) {
    const cycle = p.order_cycle_days ?? p.warning_days
    if (p.days_since_order > cycle * p.danger_cycle_multiplier)  return 'danger'
    if (p.days_since_order > cycle * p.warning_cycle_multiplier) return 'warning'
  }
  if (p.days_since_order === null)
    return p.overdue_amount > 0 ? 'danger' : 'new'
  return 'normal'
}

// ============================================================
// 예상행동
// ============================================================

export function calcActionType(
  status: CustomerStatus,
  overdueAmount: number,
  isNew: boolean,
  revenueGap: number = 0,
): ActionType {
  if (isNew && status === 'new')  return 'new_customer'
  if (overdueAmount > 0)          return 'collect_payment'
  if (status === 'danger')        return 'visit'
  if (status === 'warning')       return 'call'
  if (revenueGap < 0 && overdueAmount === 0 && status === 'normal') return 'upsell'
  return 'maintain'
}

// ============================================================
// 우선순위 점수
// ============================================================

export function calcActionScore(p: {
  overdue_amount: number
  receivable_amount?: number
  days_since_order: number | null
  order_cycle_days: number | null
  days_since_contact: number | null
  is_new: boolean
  call_connect_rate?: number | null
  connect_to_payment_rate?: number | null
  call_attempts_7d?: number
  payments_7d?: number
  revenue_gap?: number
}): number {
  let score = 0

  // 1. 연체금 (overdue 기준 강화 — /500)
  if (p.overdue_amount > 0)
    score += p.overdue_amount / 500

  // 2. 미수금 (overdue 없는 일반 미수금 — /2000)
  const receivable = p.receivable_amount ?? 0
  if (receivable > p.overdue_amount)
    score += (receivable - p.overdue_amount) / 2000

  // 3. 주문주기 초과 (0 나눗셈 방지)
  if (
    p.days_since_order !== null &&
    p.order_cycle_days !== null &&
    p.order_cycle_days > 0
  ) {
    const ratio = p.days_since_order / p.order_cycle_days
    if (ratio > 1) score += ratio * 50
    if (ratio > 2) score += 100
  } else if (p.days_since_order !== null && !p.order_cycle_days) {
    score += Math.min(p.days_since_order, 60)
  }

  // 4. 연락 없음
  score += (p.days_since_contact ?? 60) * 2

  // 5. 신규 보정
  if (p.is_new) score *= 0.5

  // 6. 전환율 보정
  if ((p.connect_to_payment_rate ?? 0) >= 0.3) score *= 1.2
  if ((p.call_attempts_7d ?? 0) >= 5 && (p.payments_7d ?? 0) === 0) score *= 0.8

  // 7. 매출 부족
  if ((p.revenue_gap ?? 0) < 0)
    score += Math.abs(p.revenue_gap!) / 10000

  return Math.round(score)
}

// ============================================================
// 다음 행동일
// ============================================================

export function calcNextActionDate(
  lastOrderDate: string | null,
  orderCycleDays: number | null,
): string | null {
  if (!lastOrderDate || !orderCycleDays) return null
  const d = new Date(lastOrderDate)
  d.setDate(d.getDate() + orderCycleDays)
  return d.toISOString().slice(0, 10)
}

// ============================================================
// 행동 메시지
// ============================================================

export function calcAction(
  status: CustomerStatus,
  balance: number,
  daysSince: number | null,
  warningDays: number = 14,
  dangerDays: number  = 30,
  newCustomerDays: number = 30,
  firstOrderDate: string | null = null,
  overdueAmount: number = 0,
  revenueGap: number = 0,
): ActionMessage {
  const isNew = firstOrderDate !== null
    ? Math.floor((Date.now() - new Date(firstOrderDate).getTime()) / 86400000) <= newCustomerDays
    : false

  const action_type = calcActionType(status, overdueAmount, isNew, revenueGap)

  if (status === 'danger') {
    const over = daysSince !== null ? daysSince - dangerDays : null
    if (overdueAmount >= 500000 && over !== null && over > 14)
      return { action_type, key: 'DANGER_HIGH_OVERDUE_LONG', urgency: 'high',
        text: `지금 방문 안 하면 회수 불가 — ${fmt(overdueAmount)} 연체, ${daysSince}일 방치됨` }
    if (overdueAmount >= 500000)
      return { action_type, key: 'DANGER_HIGH_OVERDUE', urgency: 'high',
        text: `오늘 수금 전화 안 하면 더 늦어집니다 — ${fmt(overdueAmount)} 연체` }
    if (overdueAmount > 0 && over !== null && over > 7)
      return { action_type, key: 'DANGER_OVERDUE_OVER7', urgency: 'high',
        text: `지금 연락 안 하면 회수 점점 어려워집니다 — ${fmt(overdueAmount)} 연체` }
    if (overdueAmount > 0)
      return { action_type, key: 'DANGER_OVERDUE_ONLY', urgency: 'high',
        text: `오늘 전화하세요 — ${fmt(overdueAmount)} 연체, 방치하면 회수 어려워짐` }
    if (daysSince !== null)
      return { action_type, key: 'DANGER_NO_ORDER', urgency: 'high',
        text: `${daysSince}일째 주문 없음 — 이번 주 안 보이면 거래 단절 위험` }
    return { action_type, key: 'DANGER_DEFAULT', urgency: 'high', text: '오늘 안으로 반드시 연락하세요' }
  }

  if (status === 'warning') {
    const toDanger = daysSince !== null ? dangerDays - daysSince : null
    if (overdueAmount > 0 && toDanger !== null && toDanger <= 3)
      return { action_type, key: 'WARNING_D3_OVERDUE', urgency: 'mid',
        text: `${toDanger}일 후 위험 전환 — 오늘 수금 전화가 마지막 기회` }
    if (overdueAmount > 0 && toDanger !== null && toDanger <= 7)
      return { action_type, key: 'WARNING_D7_OVERDUE', urgency: 'mid',
        text: `이번 주 수금 필요 — ${toDanger}일 남음, ${fmt(overdueAmount)} 연체` }
    if (overdueAmount >= 300000)
      return { action_type, key: 'WARNING_HIGH_OVERDUE', urgency: 'mid',
        text: `오늘 수금 전화 안 하면 지연됩니다 — ${fmt(overdueAmount)} 연체` }
    if (overdueAmount > 0)
      return { action_type, key: 'WARNING_OVERDUE_ONLY', urgency: 'mid',
        text: `오늘 수금 일정 확인하세요 — ${fmt(overdueAmount)} 연체` }
    if (daysSince !== null && toDanger !== null) {
      if (toDanger <= 7)
        return { action_type, key: 'WARNING_D7_NO_OVERDUE', urgency: 'mid',
          text: `${toDanger}일 후 위험 전환 — 지금 연락하면 막을 수 있습니다` }
      return { action_type, key: 'WARNING_NO_ORDER', urgency: 'mid',
        text: `${daysSince}일째 주문 없음 — 이번 주 안에 연락하세요` }
    }
    return { action_type, key: 'WARNING_DEFAULT', urgency: 'mid', text: '오늘 확인하세요 — 미루면 위험해집니다' }
  }

  if (action_type === 'new_customer')
    return { action_type, key: 'NEW_DEFAULT', urgency: 'mid', text: '첫 주문 유도 — 오늘 연락하면 바로 시작 가능' }

  if (action_type === 'upsell')
    return { action_type, key: 'UPSELL_DEFAULT', urgency: 'mid',
      text: `이번달 목표 ${fmt(Math.abs(revenueGap))} 부족 — 추가 주문 제안 기회` }

  return { action_type: 'maintain', key: 'NORMAL_DEFAULT', urgency: 'low', text: '정상 거래 중' }
}

// ============================================================
// 재압박 메시지
// ============================================================

export function calcRecontactMessage(
  overdueAmount: number,
  daysSinceContact: number | null,
  status: CustomerStatus,
): string | null {
  if (daysSinceContact === null || overdueAmount <= 0) return null
  if (status === 'danger') {
    if (daysSinceContact >= 7) return `${daysSinceContact}일 전 연락했지만 연체 그대로 — 지금 방문하세요`
    if (daysSinceContact >= 3) return `${daysSinceContact}일 전 연락 이후 해결 안 됨 — 오늘 다시 전화`
  }
  if (status === 'warning' && daysSinceContact >= 5)
    return `${daysSinceContact}일 전 연락 이후 연체 유지 — 재확인 필요`
  return null
}

// ============================================================
// 전화 기록 없음 메시지
// ============================================================

export function calcNoContactMessage(status: CustomerStatus, overdueAmount: number): string {
  if (status === 'danger'  && overdueAmount > 0) return '전화 기록 없음 — 오늘 첫 수금 전화 필요'
  if (status === 'danger')                       return '전화 기록 없음 — 즉시 연락 필요'
  if (status === 'warning' && overdueAmount > 0) return '전화 기록 없음 — 오늘 수금 확인 전화 권장'
  if (status === 'warning')                      return '전화 기록 없음 — 관계 단절 위험'
  return '전화 기록 없음'
}

function fmt(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(0)}천만원`
  if (amount >= 1000000)  return `${(amount / 1000000).toFixed(1)}백만원`
  if (amount >= 10000)    return `${Math.floor(amount / 10000)}만원`
  return `${amount.toLocaleString()}원`
}