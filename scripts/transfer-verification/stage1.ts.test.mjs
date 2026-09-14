import { makeDb, check, summary, REALMYOS_DIR } from './harness.mjs'
import { makeLoader } from './tsload.mjs'

const load = makeLoader(REALMYOS_DIR, 'realmyos')
const status = load('lib/delivery-tracking/status.ts')
const provider = load('lib/delivery-tracking/provider.ts')
const gateway = load('lib/delivery-tracking/gateway.ts')
const read = load('lib/delivery-tracking/read.ts')

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

console.log('[TS-1] 버튼 힌트 (manualDeliveryOptions)')
check('추적 전 → 진행 6 + 확인필요', same(status.manualDeliveryOptions(null, null),
  ['not_registered', 'ready', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'attention']))
check('배송중 → 배달중·완료·확인필요 (이전 단계 숨김, 같은 단계 숨김)', same(status.manualDeliveryOptions('in_transit', 3),
  ['out_for_delivery', 'delivered', 'attention']))
check('확인필요(도달 3) → 배송중 복귀 + 이후 단계, 확인필요 버튼 없음', same(status.manualDeliveryOptions('attention', 3),
  ['in_transit', 'out_for_delivery', 'delivered']))
check('완료 → 버튼 없음', same(status.manualDeliveryOptions('delivered', 5), []))
check('조회오류는 버튼에 없음', !status.manualDeliveryOptions(null, null).includes('lookup_error'))
check('rank: 예외·모르는 값 null', status.deliveryProgressRank('attention') === null && status.deliveryProgressRank('xx') === null && status.deliveryProgressRank('delivered') === 5)

console.log('[TS-2] 수동 입력 provider 매핑 — 모르는 값은 조회오류')
const m = provider.manualAdminProvider.mapRawStatus
check('코드값 그대로', m('in_transit') === 'in_transit')
check('한글 라벨', m('배송 완료') === 'delivered')
check('대문자/변형은 추측하지 않음', m('DELIVERED') === 'lookup_error' && m('배송완료') === 'lookup_error')
check('빈 값', m(null) === 'lookup_error' && m('') === 'lookup_error')
check('provider 등록 조회', provider.getDeliveryProvider('manual_supplier')?.source === 'manual_supplier' && provider.getDeliveryProvider('provider:x') === null)

console.log('[TS-3] 중복 방지 키')
check('제출 UUID → manual:uuid', gateway.buildManualDedupeKey('3F2504E0-4F89-11D3-9A0C-0305E82C3301') === 'manual:3f2504e0-4f89-11d3-9a0c-0305e82c3301')
check('UUID 아니면 거부', gateway.buildManualDedupeKey('abc') === null)
check('업체 이벤트 키는 결정적', gateway.buildProviderDedupeKey({ source: 'provider:t', trackingNo: ' 123 ', rawStatus: 'DLV', occurredAt: '2026-09-15T01:00:00Z' }) === 'provider:t:123:DLV:2026-09-15T01:00:00Z')

console.log('[TS-4] 수동 입력 검증')
const base = { order_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', status: 'ready', submission_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302' }
check('정상', read.validateManualDeliveryInput(base) === null)
check('조회오류 선택 거부', read.validateManualDeliveryInput({ ...base, status: 'lookup_error' }) !== null)
check('확인필요는 사유 필수', read.validateManualDeliveryInput({ ...base, status: 'attention' }) !== null && read.validateManualDeliveryInput({ ...base, status: 'attention', note: '주소 오류' }) === null)
check('체계 밖 상태 거부', read.validateManualDeliveryInput({ ...base, status: 'shipped' }) !== null)
check('마이그레이션 전 오류 감지', read.isMissingDeliverySchema('column commerce_orders.delivery_status does not exist') === true && read.isMissingDeliverySchema('permission denied') === false)

console.log('[TS-5] 창구 → 판정 함수 전체 경로 (PGlite 에 연결한 가짜 service role 클라이언트)')
const db = await makeDb(['20260915100000_commerce_delivery_tracking.sql'])
const R = '11111111-1111-1111-1111-111111111111'
await db.query(`INSERT INTO tenants(id,name,role) VALUES ($1,'식당','restaurant')`, [R])
const { rows: [ord] } = await db.query(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address) VALUES ($1,'paid','card','paid',1000,'a','010','b') RETURNING id`, [R])
const fakeAdmin = {
  async rpc(name, p) {
    const keys = Object.keys(p)
    const sql = `SELECT public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`
    try {
      const { rows } = await db.query(sql, keys.map((k) => (k === 'p_raw_payload' ? JSON.stringify(p[k]) : p[k])))
      return { data: rows[0].r, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message } }
    }
  },
}
const sub = '3f2504e0-4f89-11d3-9a0c-0305e82c33aa'
let r = await gateway.recordDeliveryObservation(fakeAdmin, { orderId: ord.id, source: 'manual_supplier', rawStatus: '배송 중', dedupeKey: gateway.buildManualDedupeKey(sub) })
check('한글 라벨 입력 → in_transit 반영', r.ok && r.outcome === 'applied' && r.statusAfter === 'in_transit', r)
r = await gateway.recordDeliveryObservation(fakeAdmin, { orderId: ord.id, source: 'manual_supplier', rawStatus: '배송 중', dedupeKey: gateway.buildManualDedupeKey(sub) })
check('같은 제출 키 재시도 → duplicate', r.ok && r.duplicate === true, r)
r = await gateway.recordDeliveryObservation(fakeAdmin, { orderId: ord.id, source: 'manual_supplier', rawStatus: '거의 도착', dedupeKey: 'manual:x2' })
check('모르는 원본 → lookup_error 로 기록(추측 금지)', r.ok && r.mappedStatus === 'lookup_error' && r.statusAfter === 'lookup_error', r)
const { rows: evs } = await db.query(`SELECT raw_status, mapped_status, source FROM commerce_order_delivery_events WHERE dedupe_key='manual:x2'`)
check('원본 「거의 도착」 보관', evs[0]?.raw_status === '거의 도착' && evs[0]?.source === 'manual_supplier', evs)
r = await gateway.recordDeliveryObservation(fakeAdmin, { orderId: ord.id, source: 'kakao', rawStatus: 'ready', dedupeKey: 'manual:x3' })
check('등록 안 된 출처 거부', r.ok === false, r)
r = await gateway.recordDeliveryObservation(fakeAdmin, { orderId: ord.id, source: 'manual_admin', rawStatus: 'delivered', dedupeKey: 'manual:x4', actorUserId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
check('완료 → becameDelivered', r.ok && r.becameDelivered === true, r)

const noFn = { async rpc() { return { data: null, error: { message: 'Could not find the function public.apply_commerce_delivery_event(p_order_id, ...) in the schema cache' } } } }
r = await gateway.recordDeliveryObservation(noFn, { orderId: ord.id, source: 'manual_admin', rawStatus: 'ready', dedupeKey: 'manual:x5' })
check('마이그레이션 전: 안내 문구로 실패(화면 안 죽음)', r.ok === false && /마이그레이션/.test(r.error), r)

summary()
