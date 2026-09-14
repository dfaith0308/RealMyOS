// 3단계 — 자동 메시지 SQL: 사건 1회 / 판정 한 곳 / claim 한 명 / finish / 재발송
import { readFileSync } from 'node:fs'
import { makeDb, check, expectError, summary, MIG } from './harness.mjs'

const db = await makeDb([
  '20260915100000_commerce_delivery_tracking.sql',
  '20260915110000_commerce_detail_templates.sql',
  '20260915120000_delivery_completed_messages.sql',
])
const q = async (sql, params) => (await db.query(sql, params)).rows
const P = '00000000-0000-0000-0000-000000000000'
const R1 = '11111111-1111-1111-1111-111111111111'
const R2 = '22222222-2222-2222-2222-222222222222'
const S1 = '33333333-3333-3333-3333-333333333333'
const S2 = '44444444-4444-4444-4444-444444444444'
await q(`INSERT INTO tenants(id,name,role) VALUES ($1,'식당1','restaurant'),($2,'식당2','restaurant'),($3,'OO식자재','supplier'),($4,'△△유통','supplier')`, [R1, R2, S1, S2])

let seq = 0
async function order(tenant, status = 'paid') {
  const [o] = await q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address,order_number)
    VALUES ($1,$2,'card','paid',1000,'홍','010-1234-5678','서울','ORD-T-' || $3) RETURNING id`, [tenant, status, String(++seq)])
  return o.id
}
async function allocate(orderId, supplier) {
  const [l] = await q(`INSERT INTO commerce_product_listings(tenant_id,owner_type,owner_tenant_id,commerce_price,status,is_visible) VALUES ($1,'platform',$1,1000,'visible',true) RETURNING id`, [P])
  const [it] = await q(`INSERT INTO commerce_order_items(order_id,listing_id,quantity,unit_price,total_price,listing_title) VALUES ($1,$2,1,1000,1000,'마늘') RETURNING id`, [orderId, l.id])
  await q(`INSERT INTO commerce_order_allocations(commerce_order_id,commerce_order_item_id,supplier_tenant_id,item_amount,supplier_payable_amount) VALUES ($1,$2,$3,1000,1000)`, [orderId, it.id, supplier])
}
let k = 0
async function deliver(orderId, status = 'delivered') {
  const [r] = await q(`SELECT public.apply_commerce_delivery_event($1,$2,$2,'manual_admin',$3) AS r`, [orderId, status, `manual:t${++k}`])
  return r.r
}
const targets = async (ids) => q(`SELECT * FROM public.delivery_message_targets($1::uuid[])`, [ids])
const events = async (id) => q(`SELECT * FROM commerce_domain_events WHERE commerce_order_id=$1`, [id])

console.log('[S3-1] delivery_completed 사건 — 배송 완료 반영 시 1번만')
const o1 = await order(R1)
await deliver(o1, 'in_transit')
check('배송 중에는 사건 없음', (await events(o1)).length === 0)
await deliver(o1, 'delivered')
check('배송 완료 반영 → 사건 1행', (await events(o1)).length === 1)
await deliver(o1, 'delivered')
await deliver(o1, 'delivered')
check('완료가 여러 번 들어와도 사건은 1행', (await events(o1)).length === 1)
check('사건 payload 에 배송 업체 정보 없음', JSON.stringify((await events(o1))[0].payload) === '{}')
await expectError('같은 사건 직접 2번 INSERT 도 UNIQUE 가 거부', () => q(`INSERT INTO commerce_domain_events(event_type,commerce_order_id,tenant_id) VALUES ('delivery_completed',$1,$2)`, [o1, R1]), /duplicate|unique/i)

console.log('[S3-2] 판정 한 곳 — delivery_message_targets')
let t = await targets([o1])
check('설정 행 없음 → disabled (기본은 발송 안 함)', t[0].eligible === false && t[0].ineligible_reason === 'disabled', t)
await q(`INSERT INTO delivery_message_settings(scope_tenant_id, enabled) VALUES ($1, false)`, [P])
t = await targets([o1])
check('설정 기본값: enabled=false, send_mode=manual_confirm', t[0].ineligible_reason === 'disabled' && t[0].send_mode === 'manual_confirm')
await q(`UPDATE delivery_message_settings SET enabled=true WHERE scope_tenant_id=$1`, [P])
t = await targets([o1])
check('사용 켬 → eligible', t[0].eligible === true, t)
const oNot = await order(R1)
check('배송 완료 아닌 주문은 판정 목록에 없음', (await targets([oNot])).length === 0)
await q(`INSERT INTO delivery_message_exclusions(tenant_id, reason) VALUES ($1,'본인 요청')`, [R1])
t = await targets([o1])
check('제외 대상 식당 → excluded', t[0].ineligible_reason === 'excluded')
await expectError('유효한 제외는 식당당 1개', () => q(`INSERT INTO delivery_message_exclusions(tenant_id, reason) VALUES ($1,'중복')`, [R1]), /duplicate|unique/i)
await q(`UPDATE delivery_message_exclusions SET released_at=now() WHERE tenant_id=$1`, [R1])
t = await targets([o1])
check('제외 해제(삭제 아님) → 다시 eligible', t[0].eligible === true)

console.log('[S3-3] 공급자 명의 — 단독 공급이면 그 공급자, 공급자 설정 행이 기본값을 대체')
const o2 = await order(R2)
await allocate(o2, S1)
await deliver(o2)
t = await targets([o2])
check('단독 공급 → supplier_tenant_id = S1, 이름 OO식자재', t[0].supplier_tenant_id === S1 && t[0].supplier_name === 'OO식자재', t)
await q(`INSERT INTO delivery_message_settings(scope_tenant_id, enabled, sender_display) VALUES ($1, false, 'OO식자재 대표')`, [S1])
t = await targets([o2])
check('공급자 설정 행(꺼짐)이 기본값(켜짐)을 대체 → disabled', t[0].ineligible_reason === 'disabled' && t[0].settings_scope === S1)
await q(`UPDATE delivery_message_settings SET enabled=true WHERE scope_tenant_id=$1`, [S1])
const o3 = await order(R2)
await allocate(o3, S1)
await allocate(o3, S2)
await deliver(o3)
t = await targets([o3])
check('복수 공급 → 명의 공급자 없음(플랫폼 기본 설정)', t[0].supplier_tenant_id === null && t[0].settings_scope === P, t)

console.log('[S3-4] 사건 처리 — 대기/발송 안 함 기록, 자동 모드 반환')
await q(`UPDATE delivery_message_settings SET enabled=false WHERE scope_tenant_id=$1`, [S1])
let [pr] = await q(`SELECT public.process_delivery_completed_events(100) AS r`)
const acts = Object.fromEntries(pr.r.map((x) => [x.commerce_order_id, x.action]))
check('o1(기본 켜짐·확인 후 발송) → pending_approval', acts[o1] === 'pending_approval', acts)
check('o2(공급자 설정 꺼짐) → skipped', acts[o2] === 'skipped', acts)
check('o3(복수 공급·기본 켜짐) → pending_approval', acts[o3] === 'pending_approval', acts)
const d2 = (await q(`SELECT status, skip_reason FROM delivery_message_dispatches WHERE commerce_order_id=$1`, [o2]))[0]
check('발송 안 함 행 + 사유 기록', d2.status === 'skipped' && d2.skip_reason === 'disabled', d2)
;[pr] = await q(`SELECT public.process_delivery_completed_events(100) AS r`)
check('처리한 사건은 다시 처리하지 않음', pr.r.length === 0)
await q(`UPDATE delivery_message_settings SET send_mode='auto' WHERE scope_tenant_id=$1`, [P])
const o4 = await order(R2)
await deliver(o4)
;[pr] = await q(`SELECT public.process_delivery_completed_events(100) AS r`)
check('자동 모드 → auto_send 로 반환(앱이 발송)', pr.r[0]?.action === 'auto_send', pr.r)

console.log('[S3-5] claim — 한 요청만 잡는다 / finish — 성공 후 다시 대상 아님')
let [c1] = await q(`SELECT public.claim_delivery_message_dispatch($1) AS r`, [o1])
check('첫 claim 성공 + 스냅샷 반환', c1.r.claimed === true && c1.r.recipient_phone === '010-1234-5678', c1.r)
let [c2] = await q(`SELECT public.claim_delivery_message_dispatch($1) AS r`, [o1])
check('두 번째 claim → sending 이라 거부 (동시 발송 차단)', c2.r.claimed === false && c2.r.reason === 'sending', c2.r)
let [f1] = await q(`SELECT public.finish_delivery_message_dispatch($1,'both_failed','01012345678','식식이','본문',$2::jsonb) AS r`, [
  c1.r.dispatch_id, JSON.stringify([{ channel: 'kakao', result: 'failed', failure_reason: '카톡 미사용자' }, { channel: 'sms', result: 'failed', failure_reason: '통신사 오류' }]),
])
check('finish both_failed 기록', f1.r.success === true, f1.r)
t = await targets([o1])
check('실패한 주문은 다시 대상 (실패자 재발송)', t[0].eligible === true && t[0].dispatch_status === 'both_failed')
;[c1] = await q(`SELECT public.claim_delivery_message_dispatch($1) AS r`, [o1])
;[f1] = await q(`SELECT public.finish_delivery_message_dispatch($1,'sms_fallback_success','01012345678','식식이','본문',$2::jsonb) AS r`, [
  c1.r.dispatch_id, JSON.stringify([{ channel: 'kakao', result: 'skipped', failure_reason: '템플릿 없음' }, { channel: 'sms', result: 'success', external_message_id: 'M-1' }]),
])
t = await targets([o1])
check('성공 기록이 생기면 already_sent — 두 번 나가지 않는다', t[0].eligible === false && t[0].ineligible_reason === 'already_sent')
;[c2] = await q(`SELECT public.claim_delivery_message_dispatch($1) AS r`, [o1])
check('성공 후 claim 거부', c2.r.claimed === false && c2.r.reason === 'already_sent')
const att = await q(`SELECT channel, result, external_message_id FROM delivery_message_attempts a JOIN delivery_message_dispatches d ON d.id=a.dispatch_id WHERE d.commerce_order_id=$1 ORDER BY attempted_at, channel`, [o1])
check('시도마다 채널·결과·외부 번호 기록 (4건)', att.length === 4 && att.some((a) => a.external_message_id === 'M-1'), att)
;[f1] = await q(`SELECT public.finish_delivery_message_dispatch($1,'kakao_success','x','x','x','[]'::jsonb) AS r`, [c1.r.dispatch_id])
check('claim 없이 finish 로 결과 덮어쓰기 거부', f1.r.success === false, f1.r)
;[c1] = await q(`SELECT public.claim_delivery_message_dispatch($1) AS r`, [o3])
;[f1] = await q(`SELECT public.finish_delivery_message_dispatch($1,'test_simulated','01012345678','식식이','본문','[{"channel":"sms","result":"simulated","test_mode":true}]'::jsonb) AS r`, [c1.r.dispatch_id])
t = await targets([o3])
check('테스트 모드 기록은 성공으로 치지 않음 → 계속 대상', t[0].eligible === true && t[0].dispatch_status === 'test_simulated')
await expectError('잘못된 최종 상태 코드', async () => {
  const [x] = await q(`SELECT public.finish_delivery_message_dispatch($1,'sent','a','b','c','[]'::jsonb) AS r`, [c1.r.dispatch_id])
  if (x.r.success === false) throw new Error(x.r.error)
}, /invalid/)

console.log('[S3-6] 취소된 주문 / 권한 / 재적용')
await q(`UPDATE commerce_orders SET status='cancelled' WHERE id=$1`, [o3])
t = await targets([o3])
check('배송 완료 후 취소된 주문 → not_active_order', t[0].ineligible_reason === 'not_active_order')
const fnSigs = ['public.delivery_message_targets(uuid[])', 'public.process_delivery_completed_events(integer)', 'public.claim_delivery_message_dispatch(uuid,uuid)', 'public.finish_delivery_message_dispatch(uuid,text,text,text,text,jsonb,uuid)']
let privOk = true
for (const sig of fnSigs) {
  const [p] = await q(`SELECT has_function_privilege('authenticated','${sig}','EXECUTE') a, has_function_privilege('anon','${sig}','EXECUTE') b, has_function_privilege('service_role','${sig}','EXECUTE') c`)
  if (p.a || p.b || !p.c) privOk = false
}
check('판정·처리·claim·finish 함수: anon/authenticated 불가, service_role 가능', privOk)
await expectError('설정 보내는 분 빈 문자열 거부', () => q(`UPDATE delivery_message_settings SET sender_display='  ' WHERE scope_tenant_id=$1`, [P]), /check/i)
try {
  await db.exec(readFileSync(`${MIG}/20260915120000_delivery_completed_messages.sql`, 'utf8'))
  check('2회 적용 오류 없음', true)
} catch (e) {
  check('2회 적용 오류 없음', false, e.message)
}
await deliver(await order(R1))
check('재적용 후에도 트리거 1개 — 사건 중복 없음', (await q(`SELECT count(*)::int n FROM pg_trigger WHERE tgname='trg_emit_delivery_completed_event'`))[0].n === 1)

summary()
