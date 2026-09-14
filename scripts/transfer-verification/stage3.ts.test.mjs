// 3단계 — 자동 메시지 TS: 문구·광고 금지 / 안전장치 5겹 / 알림톡→문자 대체 / 사건→발송 전체 경로
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeDb, check, summary, REALMYOS_DIR } from './harness.mjs'
import { makeLoader } from './tsload.mjs'

const load = makeLoader(REALMYOS_DIR, 'realmyos')
const T = load('lib/delivery-message/template.ts')
const S = load('lib/delivery-message/safety.ts')
const SEND = load('lib/delivery-message/send.ts')
const PROC = load('lib/delivery-message/processor.ts')
const GW = load('lib/delivery-tracking/gateway.ts')

console.log('[M-1] 문구 — 발신 명의 식식이 + 보내는 분(공급자)')
let m = T.composeDeliveryCompletedMessage({ orderId: 'abcdef12-0000', orderNumber: 'ORD-20260915-00001', settingsSenderDisplay: null, supplierName: 'OO식자재', thankYouMessage: null })
check('첫 줄 [식식이] 명의', m.text.startsWith('[식식이]'))
check('보내는 분 = 단독 공급자 상호', m.text.includes('보내는 분: OO식자재') && m.senderDisplay === 'OO식자재')
check('감사 메시지 비우면 기본 문구', m.text.includes(T.DEFAULT_THANK_YOU))
check('알림톡 변수 3개가 틀의 변수와 일치', Object.keys(m.variables).every((k) => T.ALIMTALK_TEMPLATE_TEXT.includes(k)) && Object.keys(m.variables).length === 3)
m = T.composeDeliveryCompletedMessage({ orderId: 'abcdef12-0000', orderNumber: null, settingsSenderDisplay: 'OO식자재 대표 김철수', supplierName: 'OO식자재', thankYouMessage: '늘 감사합니다' })
check('설정의 보내는 분 표기가 상호보다 우선 / 주문번호 없으면 id 앞 8자', m.text.includes('보내는 분: OO식자재 대표 김철수') && m.text.includes('ABCDEF12'))
m = T.composeDeliveryCompletedMessage({ orderId: 'x', orderNumber: 'O-1', settingsSenderDisplay: null, supplierName: null, thankYouMessage: null })
check('공급자·표기 없으면 보내는 분 = 식식이', m.senderDisplay === '식식이')
check('변수 자리표시가 본문에 남지 않음', !/#\{/.test(m.text))

console.log('[M-2] 광고 금지 — 저장 단계 거절 규칙')
const bad = [
  ['https://siksiki.com/event', 'link'], ['www.naver.com', 'link'], ['siksiki.co.kr 방문', 'link'], ['bit.ly/abc', 'link'],
  ['문의 010-1234-5678', 'phone'], ['02 123 4567 로 연락', 'phone'], ['1588-1234', 'phone'], ['01012345678', 'phone'],
  ['같은 상품을 특별가로', 'ad_word'], ['다음 주문 10% 할인', 'ad_word'], ['쿠폰 드려요', 'ad_word'], ['1+1 이벤트', 'ad_word'], ['SALE 진행', 'ad_word'],
]
for (const [text, kind] of bad) {
  const v = T.findContentViolation(text)
  check(`거절: 「${text}」 → ${kind}`, v?.kind === kind, v)
}
const good = ['주문해 주셔서 감사합니다. 맛있게 쓰세요!', 'OO식자재 대표 김철수', T.DEFAULT_THANK_YOU, '신선하게 보관해 주세요 (냉장 0~5도)']
for (const text of good) check(`통과: 「${text.slice(0, 20)}」`, T.findContentViolation(text) === null, T.findContentViolation(text))
check('거절 문구에 이유(링크/전화번호/광고성 단어) 표시', /전화번호/.test(T.contentViolationMessage('감사 메시지', { kind: 'phone', match: '010' })))

console.log('[M-3] 안전장치 5겹 — 순서대로')
const keys = { SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_SENDER: '02-000-0000' }
let sf = S.resolveSendSafety({})
check('1) 열쇠 없음 → 테스트', sf.testMode && /열쇠/.test(sf.testReason))
sf = S.resolveSendSafety({ ...keys })
check('2) 스위치 꺼짐(기본) → 테스트', sf.testMode && /스위치/.test(sf.testReason))
sf = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'yes' })
check('2) 스위치는 정확히 "true" 만 인정', sf.testMode)
sf = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true', VERCEL_ENV: 'preview' })
check('3) preview 배포 → 테스트', sf.testMode && /preview/.test(sf.testReason))
sf = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true', VERCEL_ENV: 'production' })
check('1~3 통과 → 실제 발송 / 4) 템플릿 없음 → kakao null', !sf.testMode && sf.kakao === null)
sf = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true', SOLAPI_KAKAO_PF_ID: 'pf', SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED: 'tpl' })
check('4) pfId+템플릿 둘 다 있을 때만 알림톡', sf.kakao?.pfId === 'pf' && sf.kakao?.templateId === 'tpl')
check('5) 휴대전화 정규화', S.normalizeMobilePhone('010-1234-5678') === '01012345678' && S.normalizeMobilePhone('02-123-4567') === null && S.normalizeMobilePhone('0101234') === null && S.normalizeMobilePhone(null) === null)

console.log('[M-4] 알림톡 우선 → 문자 대체')
function fakeChannels(kakaoOk, smsOk) {
  const calls = { kakao: 0, sms: 0 }
  return {
    calls,
    sendKakao: async () => { calls.kakao++; return kakaoOk ? { ok: true, messageId: 'K-1' } : { ok: false, error: '카카오톡 미사용자' } },
    sendSms: async () => { calls.sms++; return smsOk ? { ok: true, messageId: 'S-1' } : { ok: false, error: '통신사 오류' } },
  }
}
const live = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true', SOLAPI_KAKAO_PF_ID: 'pf', SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED: 'tpl' })
const liveNoTpl = S.resolveSendSafety({ ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true' })
const base = { rawPhone: '010-1234-5678', text: '본문', variables: {} }
let ch = fakeChannels(true, true)
let out = await SEND.sendWithFallback({ ...base, safety: live, channels: ch })
check('카카오 성공 → kakao_success, 문자 안 보냄', out.status === 'kakao_success' && ch.calls.kakao === 1 && ch.calls.sms === 0)
ch = fakeChannels(false, true)
out = await SEND.sendWithFallback({ ...base, safety: live, channels: ch })
check('카카오 실패 → 문자 성공 = sms_fallback_success, 실패 사유 기록', out.status === 'sms_fallback_success' && ch.calls.sms === 1 && out.attempts[0].failure_reason === '카카오톡 미사용자')
ch = fakeChannels(false, false)
out = await SEND.sendWithFallback({ ...base, safety: live, channels: ch })
check('둘 다 실패 → both_failed, 시도 2건', out.status === 'both_failed' && out.attempts.length === 2)
ch = fakeChannels(true, true)
out = await SEND.sendWithFallback({ ...base, safety: liveNoTpl, channels: ch })
check('템플릿 없음 → 카카오 건너뜀(호출 0) → 문자', out.status === 'sms_fallback_success' && ch.calls.kakao === 0 && out.attempts[0].result === 'skipped')
ch = fakeChannels(true, true)
out = await SEND.sendWithFallback({ ...base, rawPhone: '02-123-4567', safety: live, channels: ch })
check('번호 형식 이상 → failed, 어떤 채널도 호출 안 함', out.status === 'failed' && ch.calls.kakao + ch.calls.sms === 0)
ch = fakeChannels(true, true)
out = await SEND.sendWithFallback({ ...base, safety: S.resolveSendSafety({}), channels: ch })
check('테스트 모드 → test_simulated, 외부 호출 0, 시도는 기록', out.status === 'test_simulated' && ch.calls.kakao + ch.calls.sms === 0 && out.attempts.every((a) => a.test_mode))

console.log('[M-5] message.ts 는 건드리지 않음 / 문자 경로 재사용')
const channelsSrc = readFileSync(join(REALMYOS_DIR, 'src/lib/delivery-message/channels.ts'), 'utf8')
check('채널 모듈이 actions/message 를 import 하지 않음 (import 문 기준 — 주석의 언급은 제외)', !/from\s+['"]@\/actions\/message['"]/.test(channelsSrc))
check('message.ts 는 이번 작업에서 수정되지 않음 (git diff 없음)', (await import('node:child_process')).execSync('git diff --name-only HEAD -- src/actions/message.ts', { cwd: REALMYOS_DIR }).toString().trim() === '')
check('문자는 기존 lib/solapi-admin sendSolapiText 재사용', /from '@\/lib\/solapi-admin'/.test(channelsSrc) && /sendSolapiText\(/.test(channelsSrc))
const msgFiles = readdirSync(join(REALMYOS_DIR, 'src/lib/delivery-message'))
check('메시지 모듈이 배송 조회 업체 코드를 import 하지 않음', msgFiles.every((f) => !/delivery-tracking/.test(readFileSync(join(REALMYOS_DIR, 'src/lib/delivery-message', f), 'utf8'))))

console.log('[M-6] 전체 경로 — 배송 입력(창구) → 사건 → 판정 → 자동 발송 → 결과 (PGlite)')
const db = await makeDb(['20260915100000_commerce_delivery_tracking.sql', '20260915110000_commerce_detail_templates.sql', '20260915120000_delivery_completed_messages.sql'])
const q = async (sql, p) => (await db.query(sql, p)).rows
const SETOF = new Set(['delivery_message_targets'])
const admin = {
  async rpc(name, params) {
    const keys = Object.keys(params)
    const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ')
    const sql = SETOF.has(name) ? `SELECT * FROM public.${name}(${args})` : `SELECT public.${name}(${args}) AS r`
    const vals = keys.map((k) => (params[k] !== null && typeof params[k] === 'object' && !Array.isArray(params[k]) ? JSON.stringify(params[k]) : Array.isArray(params[k]) && k === 'p_attempts' ? JSON.stringify(params[k]) : params[k]))
    try {
      const { rows } = await db.query(sql, vals)
      return { data: SETOF.has(name) ? rows : rows[0].r, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message } }
    }
  },
}
const R = '11111111-1111-1111-1111-111111111111'
await q(`INSERT INTO tenants(id,name,role) VALUES ($1,'식당','restaurant')`, [R])
await q(`INSERT INTO delivery_message_settings(scope_tenant_id, enabled, send_mode) VALUES ('00000000-0000-0000-0000-000000000000', true, 'auto')`)
const [o] = await q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address,order_number) VALUES ($1,'paid','card','paid',1000,'홍','010-9876-5432','서울','ORD-E2E-1') RETURNING id`, [R])
const env = { ...keys, DELIVERY_MESSAGE_LIVE_SEND: 'true', SOLAPI_KAKAO_PF_ID: 'pf', SOLAPI_KAKAO_TEMPLATE_DELIVERY_COMPLETED: 'tpl' }
ch = fakeChannels(false, true)
const deliver = (key) => GW.recordDeliveryObservation(admin, { orderId: o.id, source: 'manual_supplier', rawStatus: 'delivered', dedupeKey: key })
let d = await deliver('manual:e1')
check('배송 완료 반영', d.ok && d.becameDelivered)
let run = await PROC.runDeliveryCompletedEvents(admin, { actorUserId: null, channels: ch, env })
check('사건 1건 처리 → 자동 발송 → 카카오 실패·문자 성공', run.ok && run.summary.processed === 1 && run.summary.auto_send?.statuses.sms_fallback_success === 1, run)
const disp = (await q(`SELECT status, recipient_phone, sender_display, body FROM delivery_message_dispatches WHERE commerce_order_id=$1`, [o.id]))[0]
check('결과·수신번호·보내는 분·본문 스냅샷 저장', disp.status === 'sms_fallback_success' && disp.recipient_phone === '01098765432' && disp.sender_display === '식식이' && disp.body.includes('ORD-E2E-1'), disp)
d = await deliver('manual:e2')
d = await deliver('manual:e1')
run = await PROC.runDeliveryCompletedEvents(admin, { actorUserId: null, channels: ch, env })
check('배송 완료가 또 들어와도(다른 키·같은 키) 추가 사건 0 → 추가 발송 0', run.ok && run.summary.processed === 0 && ch.calls.kakao === 1 && ch.calls.sms === 1)
const again = await PROC.sendDeliveryMessages(admin, [o.id], { actorUserId: null, channels: ch, env })
check('관리자가 같은 주문 발송을 또 눌러도 already_sent 로 빠짐 — 한 번만 나감', again.ok && again.summary.claimed === 0 && again.summary.not_claimed[0].reason === 'already_sent' && ch.calls.sms === 1)

const [o2] = await q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address,order_number) VALUES ($1,'paid','card','paid',1000,'홍','010-1111-2222','서울','ORD-E2E-2') RETURNING id`, [R])
await GW.recordDeliveryObservation(admin, { orderId: o2.id, source: 'manual_admin', rawStatus: 'delivered', dedupeKey: 'manual:e3' })
const ch2 = fakeChannels(false, false)
run = await PROC.runDeliveryCompletedEvents(admin, { actorUserId: null, channels: ch2, env })
check('둘 다 실패 → both_failed', run.ok && run.summary.auto_send?.statuses.both_failed === 1)
const ch3 = fakeChannels(true, true)
const [p1, p2] = await Promise.all([
  PROC.sendDeliveryMessages(admin, [o2.id], { actorUserId: null, channels: ch3, env }),
  PROC.sendDeliveryMessages(admin, [o2.id], { actorUserId: null, channels: ch3, env }),
])
check('실패 건 재발송을 동시에 두 번 눌러도 실제 발송 1번 (claim)', p1.ok && p2.ok && ch3.calls.kakao === 1 && p1.summary.claimed + p2.summary.claimed === 1)
const atts = await q(`SELECT count(*)::int n FROM delivery_message_attempts a JOIN delivery_message_dispatches d ON d.id=a.dispatch_id WHERE d.commerce_order_id=$1`, [o2.id])
check('실패 시도 2건 + 재발송 성공 1건 = 3건 기록', atts[0].n === 3, atts)

const [o3] = await q(`INSERT INTO commerce_orders(tenant_id,status,payment_method,payment_status,total_amount,shipping_name,shipping_phone,shipping_address) VALUES ($1,'paid','card','paid',1000,'홍','010-3333-4444','서울') RETURNING id`, [R])
await q(`UPDATE delivery_message_settings SET send_mode='manual_confirm'`)
await GW.recordDeliveryObservation(admin, { orderId: o3.id, source: 'manual_admin', rawStatus: 'delivered', dedupeKey: 'manual:e4' })
const ch4 = fakeChannels(true, true)
run = await PROC.runDeliveryCompletedEvents(admin, { actorUserId: null, channels: ch4, env })
check('확인 후 발송 모드 → 발송 대기로만 기록, 외부 호출 0', run.ok && run.summary.actions.pending_approval === 1 && ch4.calls.kakao === 0)
const noSchema = { rpc: async () => ({ data: null, error: { message: 'Could not find the function public.process_delivery_completed_events in the schema cache' } }) }
run = await PROC.runDeliveryCompletedEvents(noSchema, { actorUserId: null, channels: ch4, env })
check('마이그레이션 전 → 안내 문구로 실패', run.ok === false && /마이그레이션/.test(run.error))

summary()
