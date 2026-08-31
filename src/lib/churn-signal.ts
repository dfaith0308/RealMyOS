import { calcOrderCycle } from '@/lib/customer-logic'

/**
 * "이탈" 판정의 단일 출처.
 *
 * 이전에는 같은 이름의 지표가 세 곳에서 서로 다르게 계산됐다.
 *   - 대시보드 "주기 이탈 위험"  : 구매 3회+ & 무주문일수 > 평균주기 × 1.5
 *   - 대시보드 "신규 재구매 대기" : 구매 1~2회 & 마지막 구매 후 30~90일
 *   - 성장엔진 "이탈 위험"       : 최근 30일 주문 0 또는 직전 30일 대비 50%+ 감소
 * 집계 단위(거래처 / 판매자×거래처 쌍)도, 주기 개념 유무도 달라서 화면마다
 * 숫자가 어긋났다. 기준을 대시보드 쪽(평균 주기 기반)으로 통일하고
 * 계산은 이 파일에서만 한다.
 *
 * 여기서는 DB를 읽지 않는다 — 호출부가 모은 주문일 배열만 받아 판정한다.
 */

/** 주기 이탈 판정 배수 — 평균 주기의 몇 배까지 기다려 주는가 */
export const CYCLE_MULTIPLIER = 1.5
/** 재구매 대기 하한 — 이 일수부터 "기다리는 중"으로 본다 */
export const REPURCHASE_WAIT_DAYS = 30
/** 재구매 대기 상한 — 이보다 오래 끊긴 곳은 대기가 아니라 이탈로 본다 */
export const REPURCHASE_WAIT_MAX_DAYS = 90

export type ChurnSignal =
  | { kind: 'none' }
  /** 구매 이력이 쌓인 거래처가 자기 평균 주기를 넘겨 끊긴 상태 */
  | {
      kind: 'cycle_risk'
      cycleDays: number
      daysSinceLast: number
      orderCount: number
      lastOrderDate: string
    }
  /** 이제 막 시작한 거래처가 두 번째(또는 세 번째) 주문을 아직 안 한 상태 */
  | {
      kind: 'repurchase_wait'
      daysSinceLast: number
      orderCount: number
      lastOrderDate: string
    }

/** KST 자정을 UTC Date 로 — 날짜 경계를 한국 기준으로 맞춘다 */
export function todayKST(): Date {
  const kst = new Date(Date.now() + 9 * 3600000)
  return new Date(kst.toISOString().slice(0, 10) + 'T00:00:00Z')
}

export function daysSince(dateStr: string, today: Date): number {
  return Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86400000)
}

/**
 * 한 거래처의 확정 주문일 목록으로 이탈 신호를 판정한다.
 *
 * @param orderDates    확정 주문일 (정렬 여부 무관, 'YYYY-MM-DD')
 * @param today         기준일 (todayKST())
 * @param orderCycleCount 평균 주기를 낼 때 쓸 최근 주문 건수
 *                        (정책키 order_cycle_calculation_count)
 *
 * cycle_risk 와 repurchase_wait 는 구매 횟수로 갈려 겹치지 않는다
 * (3회 이상 / 2회 이하).
 */
export function classifyChurnSignal(
  orderDates: string[],
  today: Date,
  orderCycleCount: number,
): ChurnSignal {
  const orderCount = orderDates.length
  if (orderCount === 0) return { kind: 'none' }

  // 최신순 — 평균 주기는 "최근 N건"으로 낸다
  const sortedDesc = [...orderDates].sort((a, b) => (a < b ? 1 : -1))
  const lastOrderDate = sortedDesc[0]!
  const daysSinceLast = daysSince(lastOrderDate, today)

  if (orderCount >= 3) {
    const cycle = calcOrderCycle(sortedDesc.slice(0, orderCycleCount))
    if (cycle !== null && cycle > 0 && daysSinceLast > cycle * CYCLE_MULTIPLIER) {
      return { kind: 'cycle_risk', cycleDays: cycle, daysSinceLast, orderCount, lastOrderDate }
    }
    return { kind: 'none' }
  }

  if (daysSinceLast >= REPURCHASE_WAIT_DAYS && daysSinceLast <= REPURCHASE_WAIT_MAX_DAYS) {
    return { kind: 'repurchase_wait', daysSinceLast, orderCount, lastOrderDate }
  }

  return { kind: 'none' }
}

/** 화면에 "무엇을 기준으로 센 숫자인지" 그대로 적어 주기 위한 값 */
export const CHURN_PARAMS = {
  cycleMultiplier: CYCLE_MULTIPLIER,
  waitDays: REPURCHASE_WAIT_DAYS,
  waitMaxDays: REPURCHASE_WAIT_MAX_DAYS,
} as const
