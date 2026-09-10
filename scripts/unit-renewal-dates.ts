/** 재청구 만료일 계산 단위 검증 — 외부 의존 없음 (npx tsx scripts/unit-renewal-dates.ts) */
import { nextExpiresAt, kstToday, MAX_RETRY, PLAN_AMOUNTS } from '../src/lib/subscription-renewal'
let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, label: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  PASS ${label}`) }
  else { fail++; console.log(`  FAIL ${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
}
const now = new Date('2026-09-02T00:00:00.000Z')

eq(nextExpiresAt('monthly', '2026-09-01T15:00:00.000Z', now), '2026-10-01T15:00:00.000Z',
   '월간: 결제일이 밀리지 않고 기존 주기 유지')
eq(nextExpiresAt('annual', '2026-09-01T15:00:00.000Z', now), '2027-09-01T15:00:00.000Z',
   '연간: +12개월, 주기 유지')

// 장기 미납 — 한 주기 더해도 과거면 미래가 될 때까지 민다 (다음날 재청구 루프 방지)
{
  const r = nextExpiresAt('monthly', '2026-03-01T00:00:00.000Z', now)
  eq(r, '2026-10-01T00:00:00.000Z', '6개월 밀린 만료일도 미래로, 날짜(1일)는 유지')
  eq(new Date(r).getTime() > now.getTime(), true, '결과가 반드시 미래')
}

eq(new Date(nextExpiresAt('monthly', null, now)).getTime() > now.getTime(), true, 'null 만료일 처리')
eq(new Date(nextExpiresAt('monthly', 'not-a-date', now)).getTime() > now.getTime(), true, '깨진 날짜 문자열 처리')

// 월말 클램핑 — setMonth 였다면 3/3 으로 튀어 2월을 통째로 건너뛴다
eq(nextExpiresAt('monthly', '2026-01-31T09:00:00.000Z', new Date('2026-01-31T10:00:00.000Z')),
   '2026-02-28T09:00:00.000Z', '1/31 +1개월 = 2/28 (월말 클램핑)')
eq(nextExpiresAt('monthly', '2026-05-31T09:00:00.000Z', new Date('2026-05-31T10:00:00.000Z')),
   '2026-06-30T09:00:00.000Z', '5/31 +1개월 = 6/30')
eq(nextExpiresAt('monthly', '2028-01-31T09:00:00.000Z', new Date('2028-01-31T10:00:00.000Z')),
   '2028-02-29T09:00:00.000Z', '윤년 1/31 +1개월 = 2/29')
eq(nextExpiresAt('annual', '2028-02-29T09:00:00.000Z', new Date('2028-02-29T10:00:00.000Z')),
   '2029-02-28T09:00:00.000Z', '윤일 연간갱신 = 2/28')

// KST 기준일 — 크론이 도는 하루의 경계
eq(kstToday(new Date('2026-09-02T22:00:00.000Z')), '2026-09-03', 'KST 날짜 경계 (UTC 22시 = KST 익일 07시)')
eq(kstToday(new Date('2026-09-02T00:00:00.000Z')), '2026-09-02', 'UTC 자정 = KST 09시, 크론 실행 시각')
eq(kstToday(new Date('2026-09-02T14:59:00.000Z')), '2026-09-02', 'KST 23:59 는 아직 같은 날')
eq(kstToday(new Date('2026-09-02T15:00:00.000Z')), '2026-09-03', 'KST 00:00 부터 다음 날')

eq(MAX_RETRY, 3, '재시도 한도 3')
eq(PLAN_AMOUNTS, { monthly: 99000, annual: 948000 }, '플랜 금액이 첫 결제(/api/toss/billing)와 동일')

console.log(`\n${pass} PASS / ${fail} FAIL`)
process.exit(fail ? 1 : 0)
