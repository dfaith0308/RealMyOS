/**
 * 상세페이지 템플릿 — 칸(field) 정의와 상속 규칙의 단일 출처.
 *
 * DB: supabase/migrations/20260915110000_commerce_detail_templates.sql
 * 식당OS 복제본: resturant_os/src/lib/detail-template.ts (칸 목록·resolve 규칙을 같이 고친다)
 *
 * 규칙 (doc/transfer-brief-siksiki.md 1-3절)
 * - 입력값만 여기 있다. 가격·수량별 단가·최소주문·배송비·발주 마감은 시스템값이라 칸이 아니다.
 * - 칸마다 따로 상속한다: 옵션 값 → 상품(템플릿) 값. 옵션 칸이 비면(NULL) 상품 값으로 돌아간다.
 * - 대표 사진·원산지·알레르기·보관·원재료는 listing 의 기존 칸이 옵션 값이다(optionSource='listing').
 * - 빈 값은 NULL 한 가지 모양뿐이다. 저장 전에 normalizeFieldValue 로 빈 문자열·빈 배열을 NULL 로 바꾼다.
 */

export type DetailFieldKind = 'text' | 'textarea' | 'lines' | 'images' | 'menu_examples' | 'faqs'

export type DetailSectionKey =
  | 'hero'
  | 'why'
  | 'fit'
  | 'story'
  | 'menu'
  | 'price_table'
  | 'order_guide'
  | 'info'
  | 'faq'

export const DETAIL_SECTIONS: { key: DetailSectionKey; no: string; title: string; system: boolean }[] = [
  { key: 'hero', no: '', title: '첫 화면', system: false },
  { key: 'why', no: '01', title: '왜 이 식자재인가', system: false },
  { key: 'fit', no: '02', title: '어떤 매장에 맞는가', system: false },
  { key: 'story', no: '03', title: '산지·가공·보관·HACCP', system: false },
  { key: 'menu', no: '04', title: '실제 메뉴 적용 예시', system: false },
  { key: 'price_table', no: '05', title: '규격×수량 단가표', system: true },
  { key: 'order_guide', no: '06', title: '발주 안내', system: true },
  { key: 'info', no: '07', title: '원산지·알레르기·유통기한', system: false },
  { key: 'faq', no: '08', title: '자주 묻는 질문', system: false },
]

export type DetailFieldDef = {
  key: DetailFieldKey
  section: DetailSectionKey
  label: string
  kind: DetailFieldKind
  hint?: string
  maxLen: number
  /** 'link' = 링크 테이블에 옵션 전용 칸 / 'listing' = listing 기존 칸이 옵션 값 */
  optionSource: 'link' | 'listing'
  /** optionSource='listing' 일 때 listing 컬럼 이름 */
  listingColumn?: 'image_urls' | 'origin' | 'allergen' | 'storage_method' | 'ingredients'
}

export const DETAIL_FIELD_KEYS = [
  'headline',
  'hero_image_urls',
  'why_points',
  'fit_business_types',
  'fit_store_scale',
  'fit_price_range',
  'story_body',
  'trust_points',
  'story_image_urls',
  'menu_examples',
  'info_origin',
  'info_allergen',
  'info_shelf_life',
  'info_storage',
  'info_ingredients',
  'faqs',
] as const

export type DetailFieldKey = (typeof DETAIL_FIELD_KEYS)[number]

export const DETAIL_FIELDS: DetailFieldDef[] = [
  { key: 'headline', section: 'hero', label: '핵심 한 줄', kind: 'text', maxLen: 80, optionSource: 'link', hint: '예: 껍질 까는 시간 0분, 바로 다지는 국내산 깐마늘' },
  { key: 'hero_image_urls', section: 'hero', label: '대표 사진', kind: 'images', maxLen: 10, optionSource: 'listing', listingColumn: 'image_urls', hint: '옵션(상품 등록 화면)에 상세 이미지가 있으면 그것을 먼저 씁니다' },
  { key: 'why_points', section: 'why', label: '설득 근거 (한 줄에 하나)', kind: 'lines', maxLen: 8, optionSource: 'link', hint: '원가율·조리 시간·회전율 — 식당 사장님이 그대로 복사해 쓸 수 있는 문장' },
  { key: 'fit_business_types', section: 'fit', label: '업종', kind: 'text', maxLen: 120, optionSource: 'link', hint: '예: 한식 백반, 고깃집, 중식' },
  { key: 'fit_store_scale', section: 'fit', label: '규모', kind: 'text', maxLen: 120, optionSource: 'link', hint: '예: 하루 50~150그릇' },
  { key: 'fit_price_range', section: 'fit', label: '객단가', kind: 'text', maxLen: 120, optionSource: 'link', hint: '예: 1인 8천~1만5천원' },
  { key: 'story_body', section: 'story', label: '산지·가공·보관 이야기', kind: 'textarea', maxLen: 2000, optionSource: 'link' },
  { key: 'trust_points', section: 'story', label: '신뢰 근거 (한 줄에 하나)', kind: 'lines', maxLen: 8, optionSource: 'link', hint: '예: HACCP 인증 시설 가공 / 입고 당일 선별' },
  { key: 'story_image_urls', section: 'story', label: '산지·가공 사진', kind: 'images', maxLen: 6, optionSource: 'link' },
  { key: 'menu_examples', section: 'menu', label: '메뉴 적용 예시 (사진 + 설명)', kind: 'menu_examples', maxLen: 8, optionSource: 'link' },
  { key: 'info_origin', section: 'info', label: '원산지', kind: 'text', maxLen: 200, optionSource: 'listing', listingColumn: 'origin' },
  { key: 'info_allergen', section: 'info', label: '알레르기', kind: 'text', maxLen: 200, optionSource: 'listing', listingColumn: 'allergen' },
  { key: 'info_shelf_life', section: 'info', label: '유통기한', kind: 'text', maxLen: 200, optionSource: 'link', hint: '예: 냉장 제조일로부터 14일' },
  { key: 'info_storage', section: 'info', label: '보관방법', kind: 'text', maxLen: 200, optionSource: 'listing', listingColumn: 'storage_method' },
  { key: 'info_ingredients', section: 'info', label: '원재료명', kind: 'textarea', maxLen: 1000, optionSource: 'listing', listingColumn: 'ingredients' },
  { key: 'faqs', section: 'faq', label: '질문과 답', kind: 'faqs', maxLen: 12, optionSource: 'link' },
]

/** 링크 테이블에 옵션 전용 칸이 있는 필드 — DB 컬럼과 1:1 */
export const LINK_OVERRIDE_KEYS = DETAIL_FIELDS.filter((f) => f.optionSource === 'link').map((f) => f.key)

export type MenuExample = { image_url: string | null; caption: string | null }
export type FaqItem = { q: string; a: string }

export type DetailFieldValue = string | string[] | MenuExample[] | FaqItem[] | null

export type DetailValues = Partial<Record<DetailFieldKey, DetailFieldValue>>

const URL_RE = /^https:\/\/[^\s]+$/i

function cleanText(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n/g, '\n').trim()
  return t ? t.slice(0, maxLen) : null
}

/**
 * 화면 입력 → 저장 값. 빈 것은 전부 NULL (DB CHECK 와 같은 규칙).
 * 오류가 있으면 error 로 알린다(잘린 채 조용히 저장하지 않을 항목만).
 */
export function normalizeFieldValue(
  def: DetailFieldDef,
  raw: unknown,
): { value: DetailFieldValue; error?: string } {
  switch (def.kind) {
    case 'text':
    case 'textarea': {
      if (raw == null) return { value: null }
      if (typeof raw !== 'string') return { value: null, error: `${def.label}: 글자만 입력할 수 있습니다` }
      const t = raw.replace(/\r\n/g, '\n').trim()
      if (t.length > def.maxLen) return { value: null, error: `${def.label}: ${def.maxLen}자 이하로 입력해 주세요` }
      return { value: t || null }
    }
    case 'lines': {
      const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : []
      const lines = arr.map((x) => cleanText(x, 300)).filter((x): x is string => Boolean(x))
      if (lines.length > def.maxLen) return { value: null, error: `${def.label}: ${def.maxLen}줄 이하로 입력해 주세요` }
      return { value: lines.length ? lines : null }
    }
    case 'images': {
      const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : []
      const urls = arr.map((x) => cleanText(x, 1000)).filter((x): x is string => Boolean(x))
      const bad = urls.find((u) => !URL_RE.test(u))
      if (bad) return { value: null, error: `${def.label}: https 주소만 넣을 수 있습니다 (${bad.slice(0, 40)})` }
      if (urls.length > def.maxLen) return { value: null, error: `${def.label}: ${def.maxLen}장 이하로 넣어 주세요` }
      return { value: urls.length ? [...new Set(urls)] : null }
    }
    case 'menu_examples': {
      const arr = Array.isArray(raw) ? raw : []
      const items: MenuExample[] = []
      for (const it of arr) {
        const o = (it ?? {}) as Record<string, unknown>
        const image_url = cleanText(o.image_url, 1000)
        const caption = cleanText(o.caption, 200)
        if (!image_url && !caption) continue
        if (image_url && !URL_RE.test(image_url)) return { value: null, error: `${def.label}: 사진은 https 주소만 넣을 수 있습니다` }
        items.push({ image_url, caption })
      }
      if (items.length > def.maxLen) return { value: null, error: `${def.label}: ${def.maxLen}개 이하로 넣어 주세요` }
      return { value: items.length ? items : null }
    }
    case 'faqs': {
      const arr = Array.isArray(raw) ? raw : []
      const items: FaqItem[] = []
      for (const it of arr) {
        const o = (it ?? {}) as Record<string, unknown>
        const q = cleanText(o.q, 200)
        const a = cleanText(o.a, 1000)
        if (!q && !a) continue
        if (!q || !a) return { value: null, error: `${def.label}: 질문과 답을 모두 채우거나 둘 다 비워 주세요` }
        items.push({ q, a })
      }
      if (items.length > def.maxLen) return { value: null, error: `${def.label}: ${def.maxLen}개 이하로 넣어 주세요` }
      return { value: items.length ? items : null }
    }
  }
}

/** 값이 "채워졌는가" — 화면 숨김 판단과 상속 판단이 같은 기준을 쓴다 */
export function isFilled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

export type ListingOptionColumns = {
  image_urls: string[] | null
  origin: string | null
  allergen: string | null
  storage_method: string | null
  ingredients: string | null
}

export type ResolvedField = {
  key: DetailFieldKey
  value: DetailFieldValue
  /** 'option' = 옵션 자기 값 / 'template' = 상품 값 상속 / 'empty' = 둘 다 없음(숨김) */
  from: 'option' | 'template' | 'empty'
}

/**
 * 칸 단위 상속 — 판정은 이 함수 한 곳에서만 한다.
 * 옵션 값(링크 칸 또는 listing 기존 칸) → 상품(템플릿) 값 → 비어 있음.
 */
export function resolveDetailFields(
  template: DetailValues,
  link: DetailValues | null,
  listing: ListingOptionColumns | null,
): Record<DetailFieldKey, ResolvedField> {
  const out = {} as Record<DetailFieldKey, ResolvedField>
  for (const def of DETAIL_FIELDS) {
    const optionValue: unknown =
      def.optionSource === 'listing'
        ? def.listingColumn && listing
          ? listing[def.listingColumn]
          : null
        : link?.[def.key] ?? null
    const templateValue = template[def.key] ?? null

    if (isFilled(optionValue)) {
      const v = typeof optionValue === 'string' ? optionValue.trim() : optionValue
      out[def.key] = { key: def.key, value: v as DetailFieldValue, from: 'option' }
    } else if (isFilled(templateValue)) {
      out[def.key] = { key: def.key, value: templateValue, from: 'template' }
    } else {
      out[def.key] = { key: def.key, value: null, from: 'empty' }
    }
  }
  return out
}
