import { readFileSync } from 'node:fs'
import { makeDb, check, expectError, summary, MIG } from './harness.mjs'

const db = await makeDb(['20260915100000_commerce_delivery_tracking.sql'])
const q = async (sql, params) => (await db.query(sql, params)).rows

const R = '11111111-1111-1111-1111-111111111111' // restaurant tenant
const ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
await q(`INSERT INTO tenants(id,name,role) VALUES ($1,'테스트식당','restaurant')`, [R])

async function newOrder(status = 'paid') {
  const [o] = await q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address,order_number)
    VALUES ($1,$2,'card','paid',10000,'홍','01012345678','서울','ORD-T-'||floor(random()*1e6)) RETURNING id`, [R, status])
  return o.id
}
async function apply(order, mapped, key, extra = {}) {
  const [r] = await q(`SELECT public.apply_commerce_delivery_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS r`, [
    order, mapped, extra.raw ?? mapped, extra.source ?? 'manual_admin', key, extra.at ?? null, ADMIN,
    '00000000-0000-0000-0000-000000000000', extra.carrier ?? null, extra.tracking ?? null, JSON.stringify(extra.payload ?? {}), extra.note ?? null,
  ])
  return r.r
}
const cur = async (id) => (await q(`SELECT delivery_status, delivery_carrier, delivery_tracking_no, updated_at FROM commerce_orders WHERE id=$1`, [id]))[0]

console.log('[1] 기존 주문은 NULL 로 남는다 / 기존 status 흐름 영향 없음')
const o1 = await newOrder()
check('새 주문 delivery_status = NULL', (await cur(o1)).delivery_status === null)
await q(`UPDATE commerce_orders SET status='preparing' WHERE id=$1`, [o1])
check('기존 status 변경은 가드에 걸리지 않는다', (await q(`SELECT status FROM commerce_orders WHERE id=$1`, [o1]))[0].status === 'preparing')

console.log('[2] 정상 진행')
const before = await cur(o1)
let r = await apply(o1, 'ready', 'manual:k1', { carrier: 'CJ대한통운', tracking: '123456789' })
check('ready 적용', r.success && r.outcome === 'applied' && r.status_after === 'ready', r)
const c = await cur(o1)
check('송장·택배사 저장', c.delivery_carrier === 'CJ대한통운' && c.delivery_tracking_no === '123456789', c)
check('updated_at 은 건드리지 않음', String(c.updated_at) === String(before.updated_at))
r = await apply(o1, 'in_transit', 'manual:k2')
check('집화 건너뛰고 배송중(전진 건너뛰기) 허용', r.outcome === 'applied' && r.status_after === 'in_transit', r)

console.log('[3] 후퇴 금지')
r = await apply(o1, 'picked_up', 'manual:k3')
check('in_transit → picked_up 차단', r.success && r.outcome === 'ignored_regress' && r.status_after === 'in_transit', r)
check('주문 상태 그대로', (await cur(o1)).delivery_status === 'in_transit')
const ev = await q(`SELECT raw_status, outcome FROM commerce_order_delivery_events WHERE commerce_order_id=$1 AND dedupe_key='manual:k3'`, [o1])
check('무시된 입력도 원본과 함께 기록', ev.length === 1 && ev[0].raw_status === 'picked_up' && ev[0].outcome === 'ignored_regress', ev)

console.log('[4] 같은 상태 반복')
r = await apply(o1, 'in_transit', 'manual:k4')
check('ignored_same', r.outcome === 'ignored_same', r)

console.log('[5] 중복 방지 키')
r = await apply(o1, 'out_for_delivery', 'manual:k5')
check('out_for_delivery 적용', r.outcome === 'applied', r)
const r2 = await apply(o1, 'out_for_delivery', 'manual:k5')
check('같은 키 재전송 → duplicate, 행 추가 없음', r2.duplicate === true, r2)
const cnt = await q(`SELECT count(*)::int n FROM commerce_order_delivery_events WHERE commerce_order_id=$1 AND dedupe_key='manual:k5'`, [o1])
check('키당 1행', cnt[0].n === 1)

console.log('[6] 예외 상태와 복귀')
r = await apply(o1, 'attention', 'manual:k6', { note: '주소 불명' })
check('확인필요 진입', r.outcome === 'applied' && r.status_after === 'attention', r)
r = await apply(o1, 'ready', 'manual:k7')
check('확인필요 → 이미 지난 단계(ready)로 복귀 차단', r.outcome === 'ignored_regress', r)
r = await apply(o1, 'out_for_delivery', 'manual:k8')
check('확인필요 → 도달했던 단계(배달중)로 복귀 허용', r.outcome === 'applied' && r.status_after === 'out_for_delivery', r)

console.log('[7] 모르는 값 → 조회오류 (추측 금지)')
const o2 = await newOrder()
r = await apply(o2, '배송완료된듯?', 'provider:x:1', { source: 'provider:test', raw: 'DLV_MAYBE' })
check('체계 밖 값은 lookup_error', r.status_after === 'lookup_error', r)
const ev2 = await q(`SELECT raw_status, mapped_status FROM commerce_order_delivery_events WHERE commerce_order_id=$1`, [o2])
check('원본 값 DLV_MAYBE 보관', ev2[0].raw_status === 'DLV_MAYBE' && ev2[0].mapped_status === 'lookup_error', ev2)

console.log('[8] 배송완료는 한 번, 이후 불변')
r = await apply(o1, 'delivered', 'manual:k9')
check('delivered 적용 + became_delivered', r.outcome === 'applied' && r.became_delivered === true, r)
r = await apply(o1, 'delivered', 'manual:k10')
check('delivered 재입력(다른 키) → ignored_terminal, became_delivered=false', r.outcome === 'ignored_terminal' && r.became_delivered === false, r)
r = await apply(o1, 'attention', 'manual:k11')
check('완료 후 확인필요도 차단', r.outcome === 'ignored_terminal', r)
await expectError('적용된 delivered 2행은 인덱스가 거부',
  () => q(`INSERT INTO commerce_order_delivery_events(commerce_order_id,tenant_id,source,mapped_status,dedupe_key,outcome) VALUES ($1,$2,'manual_admin','delivered','forced','applied')`, [o1, R]),
  /duplicate key|unique/i)

console.log('[9] 결제 전·취소 주문 거부')
const o3 = await newOrder('pending_payment')
r = await apply(o3, 'ready', 'manual:p1')
check('pending_payment 거부', r.success === false, r)
const o4 = await newOrder('cancelled')
r = await apply(o4, 'ready', 'manual:c1')
check('cancelled 거부', r.success === false, r)
check('거부 시 이벤트 행 없음', (await q(`SELECT count(*)::int n FROM commerce_order_delivery_events WHERE commerce_order_id IN ($1,$2)`, [o3, o4]))[0].n === 0)

console.log('[10] 가드: 판정 함수 밖 직접 변경 차단')
await expectError('UPDATE delivery_status 직접 → 거부', () => q(`UPDATE commerce_orders SET delivery_status='delivered' WHERE id=$1`, [o2]), /apply_commerce_delivery_event/)
await expectError('INSERT 시 delivery_status 지정 → 거부', () => q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,total_amount,shipping_name,shipping_phone,shipping_address,delivery_status) VALUES ($1,'paid','card',1,'a','b','c','delivered')`, [R]), /NULL/)
await expectError('잘못된 코드 CHECK', () => q(`INSERT INTO commerce_order_delivery_events(commerce_order_id,tenant_id,source,mapped_status,dedupe_key,outcome) VALUES ($1,$2,'manual_admin','shipped','x','applied')`, [o2, R]), /check/i)
await expectError('source 형식 CHECK', () => q(`INSERT INTO commerce_order_delivery_events(commerce_order_id,tenant_id,source,mapped_status,dedupe_key,outcome) VALUES ($1,$2,'kakao','ready','y','applied')`, [o2, R]), /check/i)

console.log('[11] admin_logs 기록 (manual_admin 만)')
const logs = await q(`SELECT count(*)::int n FROM admin_logs WHERE action_type='commerce_delivery_status_recorded' AND target_id=$1`, [o1])
check('o1 관리자 입력 로그 = 중복 키 제외 입력 수(k1~k11 = 11)', logs[0].n === 11, logs)
const logs2 = await q(`SELECT count(*)::int n FROM admin_logs WHERE target_id=$1`, [o2])
check('provider 입력은 admin_logs 없음', logs2[0].n === 0)

console.log('[12] 권한')
const sig = 'public.apply_commerce_delivery_event(uuid,text,text,text,text,timestamptz,uuid,uuid,text,text,jsonb,text)'
const priv = await q(`SELECT has_function_privilege('authenticated', '${sig}', 'EXECUTE') a,
  has_function_privilege('anon', '${sig}', 'EXECUTE') b,
  has_function_privilege('service_role', '${sig}', 'EXECUTE') c`)
check('authenticated/anon 실행 불가, service_role 가능', priv[0].a === false && priv[0].b === false && priv[0].c === true, priv)

console.log('[13] 마이그레이션 재실행 안전 (IF NOT EXISTS)')
try {
  await db.exec(readFileSync(`${MIG}/20260915100000_commerce_delivery_tracking.sql`, 'utf8'))
  check('2회 적용 오류 없음', true)
} catch (e) {
  check('2회 적용 오류 없음', false, e.message)
}

summary()
