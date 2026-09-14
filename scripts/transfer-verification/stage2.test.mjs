// 2단계 — 상세페이지 템플릿: SQL 제약 + 상속 규칙 + 화면 모델 + 렌더
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { makeDb, check, expectError, summary, MIG, REALMYOS_DIR, RESTAURANT_OS_DIR } from './harness.mjs'
import { makeLoader } from './tsload.mjs'

const require = createRequire(import.meta.url)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── SQL ─────────────────────────────────────────────────────────────────────────
console.log('[S2-SQL] 마이그레이션 20260915110000')
const db = await makeDb(['20260915100000_commerce_delivery_tracking.sql', '20260915110000_commerce_detail_templates.sql'])
const q = async (sql, params) => (await db.query(sql, params)).rows
const P = '00000000-0000-0000-0000-000000000000'
const [l1] = await q(`INSERT INTO commerce_product_listings(tenant_id,owner_type,owner_tenant_id,commerce_price,status,is_visible,spec) VALUES ($1,'platform',$1,10000,'visible',true,'1kg') RETURNING id`, [P])
const [l2] = await q(`INSERT INTO commerce_product_listings(tenant_id,owner_type,owner_tenant_id,commerce_price,status,is_visible,spec) VALUES ($1,'platform',$1,45000,'visible',true,'5kg') RETURNING id`, [P])
const [t] = await q(`INSERT INTO commerce_detail_templates(title, headline, why_points) VALUES ('깐마늘','껍질 까는 시간 0분', ARRAY['원가율 12%']) RETURNING id`)
check('템플릿 생성', Boolean(t?.id))
await expectError('빈 제목 거부', () => q(`INSERT INTO commerce_detail_templates(title) VALUES ('  ')`), /check/i)
await expectError('빈 문자열 칸 거부(빈 값은 NULL 한 가지)', () => q(`UPDATE commerce_detail_templates SET headline='' WHERE id=$1`, [t.id]), /check/i)
await expectError('빈 배열 칸 거부', () => q(`UPDATE commerce_detail_templates SET why_points='{}' WHERE id=$1`, [t.id]), /check/i)
await expectError('빈 JSON 배열 거부', () => q(`UPDATE commerce_detail_templates SET faqs='[]'::jsonb WHERE id=$1`, [t.id]), /check/i)
await expectError('JSON 객체(배열 아님) 거부', () => q(`UPDATE commerce_detail_templates SET faqs='{"q":"a"}'::jsonb WHERE id=$1`, [t.id]), /check/i)
await q(`UPDATE commerce_detail_templates SET headline=NULL WHERE id=$1`, [t.id])
check('NULL 로 지우기 허용', (await q(`SELECT headline FROM commerce_detail_templates WHERE id=$1`, [t.id]))[0].headline === null)

await q(`INSERT INTO commerce_listing_detail_links(listing_id, template_id, sort_order) VALUES ($1,$2,0)`, [l1.id, t.id])
await q(`INSERT INTO commerce_listing_detail_links(listing_id, template_id, sort_order, headline) VALUES ($1,$2,1,'5kg 는 박스 단위')`, [l2.id, t.id])
const [t2] = await q(`INSERT INTO commerce_detail_templates(title) VALUES ('다른 템플릿') RETURNING id`)
await expectError('listing 하나는 템플릿 하나에만(PK)', () => q(`INSERT INTO commerce_listing_detail_links(listing_id, template_id) VALUES ($1,$2)`, [l1.id, t2.id]), /duplicate|unique/i)
await expectError('옵션 칸도 빈 문자열 거부', () => q(`UPDATE commerce_listing_detail_links SET story_body=' ' WHERE listing_id=$1`, [l1.id]), /check/i)
await expectError('없는 listing 연결 거부(FK)', () => q(`INSERT INTO commerce_listing_detail_links(listing_id, template_id) VALUES (gen_random_uuid(),$1)`, [t.id]), /foreign key/i)
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='commerce_listing_detail_links'`)).map((r) => r.column_name)
check('옵션 테이블에 listing 중복 칸(원산지·알레르기·보관·원재료·대표사진) 없음', !['info_origin', 'info_allergen', 'info_storage', 'info_ingredients', 'hero_image_urls'].some((c) => cols.includes(c)), cols)
check('기존 listing 테이블 컬럼 추가 없음', !(await q(`SELECT column_name FROM information_schema.columns WHERE table_name='commerce_product_listings' AND column_name ILIKE '%template%'`)).length)
const rls = await q(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('commerce_detail_templates','commerce_listing_detail_links')`)
check('두 테이블 RLS 켜짐', rls.length === 2 && rls.every((r) => r.relrowsecurity))
try {
  await db.exec(readFileSync(`${MIG}/20260915110000_commerce_detail_templates.sql`, 'utf8'))
  check('2회 적용 오류 없음', true)
} catch (e) {
  check('2회 적용 오류 없음', false, e.message)
}

// ── 상속 규칙 (realmyos 원본) ────────────────────────────────────────────────────
console.log('[S2-TS] 칸 단위 상속 — realmyos lib/detail-template/fields.ts')
const R = makeLoader(REALMYOS_DIR, 'realmyos')
const F = R('lib/detail-template/fields.ts')
const SYS = R('lib/detail-template/system.ts')
const def = (k) => F.DETAIL_FIELDS.find((d) => d.key === k)

check('normalize: 공백 문자열 → NULL', F.normalizeFieldValue(def('headline'), '   ').value === null)
check('normalize: 한 줄씩 → 배열, 빈 줄 제거', same(F.normalizeFieldValue(def('why_points'), '원가율 12%\n\n  조리 3분 단축 \n').value, ['원가율 12%', '조리 3분 단축']))
check('normalize: 빈 줄만 → NULL', F.normalizeFieldValue(def('why_points'), '\n \n').value === null)
check('normalize: http(비보안) 사진 거부', Boolean(F.normalizeFieldValue(def('story_image_urls'), ['http://x.com/a.jpg']).error))
check('normalize: FAQ 질문만 있고 답 없음 → 오류', Boolean(F.normalizeFieldValue(def('faqs'), [{ q: '냉동인가요?', a: '' }]).error))
check('normalize: FAQ 둘 다 빈 행은 버림 → NULL', F.normalizeFieldValue(def('faqs'), [{ q: '', a: '' }]).value === null)
check('normalize: 최대 글자 초과는 자르지 않고 오류', Boolean(F.normalizeFieldValue(def('headline'), 'x'.repeat(81)).error))

const template = { headline: '공통 한 줄', why_points: ['공통 근거'], info_origin: '국내산(템플릿)', info_shelf_life: '14일', story_body: '공통 이야기' }
const listingCols = { image_urls: null, origin: '', allergen: '대두', storage_method: null, ingredients: null }
let r = F.resolveDetailFields(template, { headline: '5kg 전용 한 줄' }, listingCols)
check('옵션에 넣은 칸만 옵션 것 (headline=option)', r.headline.from === 'option' && r.headline.value === '5kg 전용 한 줄')
check('옵션에 안 넣은 칸은 상품 것 (why_points=template)', r.why_points.from === 'template' && same(r.why_points.value, ['공통 근거']))
check('둘 다 없으면 empty (fit_store_scale)', r.fit_store_scale.from === 'empty' && r.fit_store_scale.value === null)
check('listing 기존 칸이 옵션 값 (allergen=대두)', r.info_allergen.from === 'option' && r.info_allergen.value === '대두')
check('listing 기존 칸이 빈 문자열이면 템플릿으로 (origin)', r.info_origin.from === 'template' && r.info_origin.value === '국내산(템플릿)')
r = F.resolveDetailFields(template, { headline: null }, listingCols)
check('옵션 칸 지우면(NULL) 다시 상품 것', r.headline.from === 'template' && r.headline.value === '공통 한 줄')
r = F.resolveDetailFields(template, null, null)
check('연결 행 없이도 템플릿 값', r.story_body.from === 'template')
check('옵션 전용 칸 목록 = DB 링크 컬럼과 일치', same([...F.LINK_OVERRIDE_KEYS].sort(), ['faqs', 'fit_business_types', 'fit_price_range', 'fit_store_scale', 'headline', 'info_shelf_life', 'menu_examples', 'story_body', 'story_image_urls', 'trust_points', 'why_points']))
const linkCols = cols.filter((c) => !['listing_id', 'template_id', 'sort_order', 'created_by', 'updated_by', 'created_at', 'updated_at'].includes(c)).sort()
check('LINK_OVERRIDE_KEYS ↔ 실제 테이블 컬럼 1:1', same([...F.LINK_OVERRIDE_KEYS].sort(), linkCols), linkCols)
const tplCols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='commerce_detail_templates'`)).map((x) => x.column_name)
check('DETAIL_FIELD_KEYS 전부 템플릿 테이블 컬럼으로 존재', F.DETAIL_FIELD_KEYS.every((k) => tplCols.includes(k)))

console.log('[S2-SYS] 시스템값')
check('마감 시각 형식 검증', SYS.parseCutoffTime('15:00') === '15:00' && SYS.parseCutoffTime('3pm') === null && SYS.parseCutoffTime('24:00') === null)
check('배송 요일 파싱·정렬·중복 제거', same(SYS.parseWeekdays('5, 1,1,3'), [1, 3, 5]) && SYS.parseWeekdays('0,2') === null && SYS.parseWeekdays('') === null)
check('마감 라벨', SYS.formatCutoffLabel('15:00') === '오후 3시' && SYS.formatCutoffLabel('10:30') === '오전 10시 30분' && SYS.formatCutoffLabel('00:00') === '오전 12시')
const rows = SYS.buildPriceTable([{ listing_id: 'a', spec: '1kg', commerce_price: 9990, bulk_qty: 10, bulk_discount_rate: 7.5, free_shipping_qty: 5, sold_out: false }])
check('대량 단가 = 기존 상세 화면 식 Math.round(price*(1-rate/100))', rows[0].bulk.unit_price === Math.round(9990 * (1 - 7.5 / 100)))
check('옵션 1개 + 수량 조건 없음 → 단가표 숨김', SYS.shouldShowPriceTable(SYS.buildPriceTable([{ listing_id: 'a', spec: null, commerce_price: 1, bulk_qty: null, bulk_discount_rate: null, free_shipping_qty: null, sold_out: false }])) === false)
const guide = SYS.buildOrderGuide({ settings: { cutoffTime: null, deliveryWeekdays: null }, min_order_qty: 1, base_shipping_fee: null, free_shipping_qty: 3 })
check('설정 없으면 마감·요일 줄 숨김, 최소주문 1은 숨김, 배송비는 기존 문구 규칙(3,500원 기본)', same(guide, [{ label: '배송비', value: '3,500원 별도 · 3개 이상 무료배송' }]), guide)

// ── 식당OS 복제본과 원본 일치 ──────────────────────────────────────────────────
console.log('[S2-PARITY] realmyos 원본 ↔ 식당OS 복제본')
const W = makeLoader(RESTAURANT_OS_DIR, 'restaurant')
const RL = W('lib/detail-template.ts')
const cases = [
  [template, { headline: '5kg 전용' }, listingCols],
  [{}, {}, null],
  [{ faqs: [{ q: 'a', a: 'b' }], hero_image_urls: ['https://x/1.jpg'] }, { faqs: null }, { image_urls: ['https://x/own.jpg'], origin: null, allergen: null, storage_method: null, ingredients: null }],
]
check('resolveDetailFields 결과 동일 (3케이스)', cases.every(([a, b, c]) => same(F.resolveDetailFields(a, b, c), RL.resolveDetailFields(a, b, c))))
check('칸 정의 동일', same(F.DETAIL_FIELDS, RL.DETAIL_FIELDS) && same(F.DETAIL_SECTIONS, RL.DETAIL_SECTIONS))
check('시스템값 함수 동일', same(SYS.buildOrderGuide({ settings: { cutoffTime: '15:00', deliveryWeekdays: [1, 3] }, min_order_qty: 5, base_shipping_fee: 4000, free_shipping_qty: null }), RL.buildOrderGuide({ settings: { cutoffTime: '15:00', deliveryWeekdays: [1, 3] }, min_order_qty: 5, base_shipping_fee: 4000, free_shipping_qty: null })))

// ── 식당 화면 모델 + 렌더 ─────────────────────────────────────────────────────
console.log('[S2-VIEW] 식당 화면 모델 — 안 채운 섹션은 null')
const opt = (id, spec, price, extra = {}) => ({ id, spec, commerce_price: price, status: 'visible', bulk_qty: null, bulk_discount_rate: null, free_shipping_qty: null, base_shipping_fee: 3500, min_order_qty: 1, image_urls: null, origin: null, allergen: null, storage_method: null, ingredients: null, ...extra })
let v = RL.buildBuyDetailPageView({ currentListingId: 'L1', template: { why_points: ['원가율 12%'] }, overrides: {}, options: [opt('L1', '1kg', 9000)], settingsRows: [] })
check('채운 섹션(why)만 값, 나머지 입력 섹션 전부 null', same(v.why, ['원가율 12%']) && v.fit === null && v.story === null && v.menu === null && v.info === null && v.faq === null && v.headline === null)
check('옵션 1개면 규격 칩 없음, 단가표 숨김', v.options.length === 0 && v.price_table === null)
v = RL.buildBuyDetailPageView({ currentListingId: 'L2', template: {}, overrides: {}, options: [opt('L1', '1kg', 9000), opt('L2', '5kg', 42000, { status: 'sold_out' })], settingsRows: [{ key: 'storefront_order_cutoff_time', value: '15:00' }, { key: 'storefront_delivery_weekdays', value: '1,3,5' }] })
check('옵션 2개 → 칩 2개(현재 표시)·단가표 표시', v.options.length === 2 && v.options[1].current === true && v.options[1].sold_out === true && v.price_table.length === 2)
check('발주 안내 = 설정값(마감·요일) + 배송비', same(v.order_guide.map((x) => x.label), ['발주 마감', '배송 요일', '배송비']) && v.order_guide[1].value === '월·수·금')
check('노출 안 된 현재 listing → null(템플릿 안 씀)', RL.buildBuyDetailPageView({ currentListingId: 'ZZ', template: {}, overrides: {}, options: [opt('L1', '1kg', 1)], settingsRows: [] }) === null)
v = RL.buildBuyDetailPageView({ currentListingId: 'L1', template: { hero_image_urls: ['https://t/hero.jpg'] }, overrides: {}, options: [opt('L1', '1kg', 1, { image_urls: ['https://own/detail.png'] })], settingsRows: [] })
check('첫 화면 사진: 옵션 자기 상세 이미지 우선', same(v.gallery, ['https://own/detail.png']))
v = RL.buildBuyDetailPageView({ currentListingId: 'L1', template: { hero_image_urls: ['https://t/hero.jpg'] }, overrides: {}, options: [opt('L1', '1kg', 1)], settingsRows: [] })
check('옵션 사진 없으면 템플릿 대표 사진', same(v.gallery, ['https://t/hero.jpg']))

const React = require(require.resolve('react', { paths: [RESTAURANT_OS_DIR] }))
const { renderToStaticMarkup } = require(require.resolve('react-dom/server', { paths: [RESTAURANT_OS_DIR] }))
const Sections = W('components/buy/ProductDetailSections.tsx')
const titles = ['왜 이 식자재인가', '어떤 매장에 맞는가', '산지·가공·보관·HACCP', '실제 메뉴 적용 예시', '규격×수량 단가표', '발주 안내', '원산지·알레르기·유통기한', '자주 묻는 질문']

const partial = RL.buildBuyDetailPageView({ currentListingId: 'L1', template: { why_points: ['원가율 12%'] }, overrides: {}, options: [opt('L1', '1kg', 9000)], settingsRows: [] })
let html = renderToStaticMarkup(React.createElement(Sections.default, { view: partial }))
check('부분 채움 렌더: 채운 01 + 시스템 06 제목만 존재', html.includes('왜 이 식자재인가') && html.includes('발주 안내'))
check('부분 채움 렌더: 빈 섹션 제목 6개는 HTML 에 아예 없음', ['어떤 매장에 맞는가', '산지·가공·보관·HACCP', '실제 메뉴 적용 예시', '규격×수량 단가표', '원산지·알레르기·유통기한', '자주 묻는 질문'].every((tt) => !html.includes(tt)))

const full = RL.buildBuyDetailPageView({
  currentListingId: 'L1',
  template: {
    headline: '껍질 까는 시간 0분', why_points: ['원가율 12%', '조리 3분 단축'], fit_business_types: '한식', fit_store_scale: '하루 100그릇', fit_price_range: '9천원',
    story_body: '의성 계약재배', trust_points: ['HACCP'], story_image_urls: ['https://t/s.jpg'], menu_examples: [{ image_url: 'https://t/m.jpg', caption: '제육볶음' }],
    info_origin: '국내산', info_shelf_life: '14일', faqs: [{ q: '냉동인가요?', a: '냉장입니다' }],
  },
  overrides: {},
  options: [opt('L1', '1kg', 9000, { bulk_qty: 10, bulk_discount_rate: 5 }), opt('L2', '5kg', 42000)],
  settingsRows: [{ key: 'storefront_order_cutoff_time', value: '15:00' }],
})
html = renderToStaticMarkup(React.createElement(Sections.default, { view: full }))
check('전체 채움 렌더: 8개 섹션 제목 모두 존재', titles.every((tt) => html.includes(tt)), titles.filter((tt) => !html.includes(tt)))
check('단가표: 대량 개당 8,550원 표시', html.includes('8,550원'))
check('표 복사 버튼(엑셀용 탭 구분) 존재', html.includes('표 복사'))
const headerHtml = renderToStaticMarkup(React.createElement(Sections.ProductDetailHeaderExtra, { view: full }))
check('첫 화면 추가 영역: 핵심 한 줄 + 규격 칩 링크', headerHtml.includes('껍질 까는 시간 0분') && headerHtml.includes('/buy/products/L2'))

summary()
