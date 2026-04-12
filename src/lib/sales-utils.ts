import type { OutcomeType } from '@/actions/contact'

// next_action_date 자동 계산 유틸
// actions 파일 밖에 위치 (Server Action 규칙 준수)
export function calcNextActionDate(outcome: OutcomeType | '', avgCycleDays: number): string {
  const cycle = Math.max(1, avgCycleDays || 7)

  const multipliers: Partial<Record<OutcomeType, number>> = {
    interested:         0.3,
    potential:          0.5,
    maintained:         0.8,
    churn_risk:         0.2,
    competitor:         1.5,
    rejected:           2.0,
    order_placed:       0.9,
  }
  const FIXED: Partial<Record<OutcomeType, number>> = {
    no_answer:          2,
    callback_requested: 1,
  }

  let addDays: number
  if (!outcome) {
    addDays = 7
  } else if (outcome in FIXED) {
    addDays = FIXED[outcome]!
  } else {
    addDays = Math.max(1, Math.round(cycle * (multipliers[outcome] ?? 1)))
  }

  const d = new Date(Date.now() + 9 * 3600000)
  d.setDate(d.getDate() + addDays)
  return d.toISOString().slice(0, 10)
}