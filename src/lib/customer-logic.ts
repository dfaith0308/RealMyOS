// ============================================================
// RealMyOS - 거래처 점수 + 행동 메시지
// src/lib/customer-logic.ts
// ============================================================

import type { CustomerStatus } from '@/actions/ledger'

export interface ActionMessage {
  text: string
  urgency: 'high' | 'mid' | 'low'
  key: string   // 분석용 고정 식별자 (message_key)
}

// ── 점수 ─────────────────────────────────────────────────────

export function calcScore(
  balance: number,
  daysSince: number | null,
): number {
  const balanceScore = Math.min(Math.floor(balance / 100000) * 5, 50)
  const daysScore    = Math.min(daysSince ?? 60, 40)
  const noOrderBonus = daysSince === null ? 10 : 0
  return balanceScore + daysScore + noOrderBonus
}

// ── 행동 메시지 ───────────────────────────────────────────────

export function calcAction(
  status: CustomerStatus,
  balance: number,
  daysSince: number | null,
  warningDays: number = 14,
  dangerDays: number  = 30,
): ActionMessage {

  // ── 위험 ──────────────────────────────────────────────────
  if (status === 'danger') {
    const overDanger = daysSince !== null ? daysSince - dangerDays : null

    if (balance >= 500000 && overDanger !== null && overDanger > 14)
      return { key: 'DANGER_HIGH_AMOUNT_LONG_OVERDUE', urgency: 'high',
        text: `지금 방문 안 하면 회수 불가 — ${fmt(balance)} 미수, ${daysSince}일 방치됨` }

    if (balance >= 500000)
      return { key: 'DANGER_HIGH_AMOUNT', urgency: 'high',
        text: `오늘 수금 전화 안 하면 더 늦어집니다 — ${fmt(balance)} 미회수` }

    if (balance > 0 && overDanger !== null && overDanger > 7)
      return { key: 'DANGER_AMOUNT_OVER7', urgency: 'high',
        text: `지금 연락 안 하면 회수 점점 어려워집니다 — ${fmt(balance)} 미수` }

    if (balance > 0 && overDanger !== null && overDanger > 0)
      return { key: 'DANGER_AMOUNT_OVERDUE', urgency: 'high',
        text: `위험 기준 ${overDanger}일 초과 — 오늘 안으로 수금 전화` }

    if (balance > 0)
      return { key: 'DANGER_AMOUNT_ONLY', urgency: 'high',
        text: `오늘 전화하세요 — ${fmt(balance)} 미수금, 방치하면 회수 어려워짐` }

    if (daysSince !== null && daysSince > dangerDays)
      return { key: 'DANGER_NO_ORDER_LONG', urgency: 'high',
        text: `${daysSince}일째 연락 없음 — 이번 주 안 보이면 거래 단절 위험` }

    return { key: 'DANGER_DEFAULT', urgency: 'high',
      text: '오늘 안으로 반드시 연락하세요' }
  }

  // ── 주의 ──────────────────────────────────────────────────
  if (status === 'warning') {
    const toDanger = daysSince !== null ? dangerDays - daysSince : null

    if (balance > 0 && toDanger !== null && toDanger <= 3)
      return { key: 'WARNING_D3_AMOUNT', urgency: 'mid',
        text: `${toDanger}일 후 위험 전환 — 오늘 수금 전화가 마지막 기회` }

    if (balance > 0 && toDanger !== null && toDanger <= 7)
      return { key: 'WARNING_D7_AMOUNT', urgency: 'mid',
        text: `이번 주 안에 수금 안 하면 위험 전환 — ${toDanger}일 남음, ${fmt(balance)}` }

    if (balance >= 300000 && daysSince !== null && daysSince > warningDays)
      return { key: 'WARNING_HIGH_AMOUNT_OVERDUE', urgency: 'mid',
        text: `오늘 수금 전화 안 하면 지연됩니다 — ${fmt(balance)}, ${daysSince}일 경과` }

    if (balance > 0 && daysSince !== null && daysSince > warningDays)
      return { key: 'WARNING_AMOUNT_OVERDUE', urgency: 'mid',
        text: `이번 주 내 미수 해결 필요 — 미루면 위험 전환` }

    if (balance >= 300000)
      return { key: 'WARNING_HIGH_AMOUNT', urgency: 'mid',
        text: `지금 연락 안 하면 회수 늦어집니다 — ${fmt(balance)} 미수금` }

    if (balance > 0)
      return { key: 'WARNING_AMOUNT_ONLY', urgency: 'mid',
        text: `오늘 수금 일정 확인하세요 — ${fmt(balance)}, 미루지 마세요` }

    if (daysSince !== null && toDanger !== null) {
      if (toDanger <= 7)
        return { key: 'WARNING_D7_NO_AMOUNT', urgency: 'mid',
          text: `${toDanger}일 후 위험 전환 — 지금 연락하면 막을 수 있습니다` }
      return { key: 'WARNING_NO_ORDER', urgency: 'mid',
        text: `${daysSince}일째 주문 없음 — 이번 주 안에 연락하세요` }
    }

    return { key: 'WARNING_DEFAULT', urgency: 'mid',
      text: '오늘 확인하세요 — 미루면 위험해집니다' }
  }

  // ── 신규 ──────────────────────────────────────────────────
  if (status === 'new')
    return { key: 'NEW_DEFAULT', urgency: 'mid',
      text: '첫 주문 유도 — 오늘 연락하면 바로 시작 가능' }

  // ── 정상 ──────────────────────────────────────────────────
  return { key: 'NORMAL_DEFAULT', urgency: 'low',
    text: '정상 거래 중' }
}

// ── 재압박 메시지 ─────────────────────────────────────────────

export function calcRecontactMessage(
  balance: number,
  daysSinceContact: number | null,
  status: CustomerStatus,
): string | null {
  if (daysSinceContact === null || balance <= 0) return null

  if (status === 'danger') {
    if (daysSinceContact >= 7)
      return `${daysSinceContact}일 전 연락했지만 미수금 그대로 — 지금 방문하세요`
    if (daysSinceContact >= 3)
      return `${daysSinceContact}일 전 연락 이후 해결 안 됨 — 오늘 다시 전화`
  }
  if (status === 'warning' && daysSinceContact >= 5)
    return `${daysSinceContact}일 전 연락 이후 미수금 유지 — 재확인 필요`

  return null
}

// ── 연락 없음 메시지 ─────────────────────────────────────────

export function calcNoContactMessage(
  status: CustomerStatus,
  balance: number,
): string {
  if (status === 'danger' && balance > 0) return '연락 기록 없음 — 오늘 첫 수금 전화 필요'
  if (status === 'danger')                return '최근 접촉 없음 — 즉시 연락 필요'
  if (status === 'warning' && balance > 0) return '연락 기록 없음 — 오늘 수금 확인 전화 권장'
  if (status === 'warning')               return '최근 접촉 없음 — 관계 단절 위험'
  if (status === 'new')                   return '아직 연락 없음 — 오늘 첫 연락 시작하세요'
  return '연락 기록 없음'
}

// ── 금액 축약 ─────────────────────────────────────────────────

function fmt(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(0)}천만원`
  if (amount >= 1000000)  return `${(amount / 1000000).toFixed(1)}백만원`
  if (amount >= 10000)    return `${Math.floor(amount / 10000)}만원`
  return `${amount.toLocaleString()}원`
}
