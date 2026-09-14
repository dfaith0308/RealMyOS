import { check, summary, RESTAURANT_OS_DIR } from './harness.mjs'
import { makeLoader } from './tsload.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const repo = RESTAURANT_OS_DIR
const load = makeLoader(repo, 'restaurant')
const React = require(require.resolve('react', { paths: [repo] }))
const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [repo] }))
const Timeline = load('components/buy/BuyDeliveryTimeline.tsx').default

console.log('[R-1] 식당 배송 타임라인 렌더')
let html = renderToStaticMarkup(React.createElement(Timeline, { data: {
  delivery_status: 'in_transit', delivery_carrier: 'CJ대한통운', delivery_tracking_no: '1234',
  reached_at: { ready: '2026-09-15T00:00:00Z', in_transit: '2026-09-15T03:00:00Z' }, max_reached_rank: 3, exception_since: null } }))
check('6단계 라벨 모두 표시', ['송장 등록 전','배송 준비','집화','배송 중','배달 중','배송 완료'].every((l) => html.includes(l)))
check('반영 시각 KST 표시 (03:00Z → 오후 12:00)', html.includes('12:00'), html.match(/9\. 15\.[^<]*/g))
check('송장번호 표시', html.includes('송장번호 1234'))
check('예외 배너 없음', !html.includes('확인이 필요한'))
html = renderToStaticMarkup(React.createElement(Timeline, { data: {
  delivery_status: 'attention', delivery_carrier: null, delivery_tracking_no: null,
  reached_at: { ready: '2026-09-15T00:00:00Z' }, max_reached_rank: 1, exception_since: '2026-09-15T05:00:00Z' } }))
check('확인필요 배너 + 상태 라벨', html.includes('확인이 필요한') && html.includes('확인 필요'))
check('자체 배송(송장 없음)이면 송장 줄 숨김', !html.includes('송장번호'))
summary()
