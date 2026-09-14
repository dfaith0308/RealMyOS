/**
 * 상세페이지 시스템값 — 관리자가 상세페이지에 입력하지 않는 값.
 *
 * 가격·수량별 단가·최소주문·배송비는 listing 에서, 발주 마감·배송 요일은 admin_settings 에서
 * **화면을 그릴 때마다** 읽어 계산한다. 저장하지 않는다(가격을 고치면 상세페이지 숫자가 같이 바뀐다).
 *
 * 식당OS 복제본: resturant_os/src/lib/detail-template.ts
 */

/** admin_settings 키 — 플랫폼 전체 발주 안내 (상품마다 입력하지 않는다) */
export const ORDER_GUIDE_SETTING_KEYS = {
  cutoffTime: 'storefront_order_cutoff_time',
  deliveryWeekdays: 'storefront_delivery_weekdays',
} as const

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const

export type OrderGuideSettings = {
  /** 'HH:MM' (KST) 또는 null */
  cutoffTime: string | null
  /** 1=월 … 7=일, 오름차순, 중복 없음. 비어 있으면 null */
  deliveryWeekdays: number[] | null
}

/** 'HH:MM' 검증 — 형식이 틀리면 null (추측해서 고치지 않는다) */
export function parseCutoffTime(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim()
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v)
  return m ? `${m[1]}:${m[2]}` : null
}

/** '1,2,5' → [1,2,5]. 1~7 밖의 값이 하나라도 있으면 전체를 null */
export function parseWeekdays(raw: string | null | undefined): number[] | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  const parts = v.split(',').map((x) => x.trim()).filter(Boolean)
  const nums = parts.map((x) => Number(x))
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return null
  const uniq = [...new Set(nums)].sort((a, b) => a - b)
  return uniq.length ? uniq : null
}

export function parseOrderGuideSettings(rows: { key: string; value: string | null }[]): OrderGuideSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]))
  return {
    cutoffTime: parseCutoffTime(m.get(ORDER_GUIDE_SETTING_KEYS.cutoffTime)),
    deliveryWeekdays: parseWeekdays(m.get(ORDER_GUIDE_SETTING_KEYS.deliveryWeekdays)),
  }
}

/** 'HH:MM' → '오후 3시' / '오전 10시 30분' */
export function formatCutoffLabel(hhmm: string): string {
  const [h, mm] = hhmm.split(':').map(Number)
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}시${mm ? ` ${mm}분` : ''}`
}

export type PriceOption = {
  listing_id: string
  spec: string | null
  commerce_price: number
  bulk_qty: number | null
  bulk_discount_rate: number | null
  free_shipping_qty: number | null
  sold_out: boolean
}

export type PriceTableRow = {
  listing_id: string
  spec_label: string
  unit_price: number
  bulk: { qty: number; rate: number; unit_price: number } | null
  free_shipping_qty: number | null
  sold_out: boolean
}

/**
 * 규격×수량 단가표.
 * 대량 단가 계산식은 식당OS 상품 상세(BuyProductDetailClient)의 `Math.round(price * (1 - rate / 100))`와 같다.
 * 표에 다른 식을 쓰면 표와 장바구니 버튼 금액이 어긋난다.
 */
export function buildPriceTable(options: PriceOption[]): PriceTableRow[] {
  return options.map((o, i) => {
    const hasBulk =
      o.bulk_qty != null && o.bulk_qty > 0 && o.bulk_discount_rate != null && o.bulk_discount_rate > 0
    return {
      listing_id: o.listing_id,
      spec_label: (o.spec ?? '').trim() || `옵션 ${i + 1}`,
      unit_price: o.commerce_price,
      bulk: hasBulk
        ? {
            qty: o.bulk_qty as number,
            rate: o.bulk_discount_rate as number,
            unit_price: Math.round(o.commerce_price * (1 - (o.bulk_discount_rate as number) / 100)),
          }
        : null,
      free_shipping_qty: o.free_shipping_qty != null && o.free_shipping_qty > 0 ? o.free_shipping_qty : null,
      sold_out: o.sold_out,
    }
  })
}

/** 표를 보여줄 가치가 있는가 — 옵션이 둘 이상이거나, 수량 조건(대량 할인·무료배송)이 있을 때만 */
export function shouldShowPriceTable(rows: PriceTableRow[]): boolean {
  if (rows.length >= 2) return true
  return rows.some((r) => r.bulk != null || r.free_shipping_qty != null)
}

export type OrderGuideRow = { label: string; value: string }

/**
 * 06 발주 안내.
 * 배송비 문구는 식당OS 상품 상세 첫 화면(BuyProductDetailClient)과 **같은 규칙**으로 만든다
 * — 기본배송비(없으면 3,500원) 별도, 무료배송 수량이 있으면 함께. 한 페이지 안에서 배송비 설명이
 * 두 가지로 갈리지 않게 하기 위해서다(shipping_type 은 첫 화면도 쓰지 않으므로 여기서도 쓰지 않는다).
 */
export function buildOrderGuide(input: {
  settings: OrderGuideSettings
  min_order_qty: number | null
  base_shipping_fee: number | null
  free_shipping_qty: number | null
}): OrderGuideRow[] {
  const rows: OrderGuideRow[] = []
  if (input.settings.cutoffTime) {
    rows.push({ label: '발주 마감', value: `${formatCutoffLabel(input.settings.cutoffTime)}까지 (한국 시간)` })
  }
  if (input.settings.deliveryWeekdays) {
    rows.push({
      label: '배송 요일',
      value: input.settings.deliveryWeekdays.map((d) => WEEKDAY_LABELS[d - 1]).join('·'),
    })
  }
  if (input.min_order_qty != null && input.min_order_qty > 1) {
    rows.push({ label: '최소 주문', value: `${input.min_order_qty}개부터` })
  }
  const fee = input.base_shipping_fee ?? 3500
  const freeQty = input.free_shipping_qty != null && input.free_shipping_qty > 0 ? input.free_shipping_qty : null
  rows.push({
    label: '배송비',
    value: `${fee.toLocaleString('ko-KR')}원 별도${freeQty ? ` · ${freeQty}개 이상 무료배송` : ''}`,
  })
  return rows
}
