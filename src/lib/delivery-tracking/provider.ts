import {
  DELIVERY_STATUS_LABEL,
  isDeliveryStatus,
  type DeliveryStatus,
} from './status'

/**
 * 조회 창구 뒤에 붙는 "업체별 연결"의 공통 모양.
 *
 * 바깥 코드(주문·배송 화면, 메시지)는 이 인터페이스만 안다. 어느 업체인지 모른다.
 * 업체를 바꾸면 이 모양을 구현한 파일 하나를 추가하고 PROVIDERS 에 등록하면 끝이다
 * (doc/transfer-brief-siksiki.md 2-1절, 원칙 1).
 *
 * 지금 연결된 것은 수동 입력 두 가지뿐이다. 택배 조회 업체는 열쇠·계약이 생기면
 * `fetchEvents` 를 구현한 provider 를 추가한다.
 */
export interface DeliveryTrackingProvider {
  /** events.source 에 들어가는 값. 'manual_admin' | 'manual_supplier' | 'provider:<id>' */
  readonly source: string
  readonly label: string
  /**
   * 업체가 준 원본 값 → 자체 상태.
   * **모르는 값은 반드시 lookup_error.** 비슷해 보인다고 추측해서 옮기지 않는다.
   */
  mapRawStatus(raw: string | null | undefined): DeliveryStatus
  /**
   * 송장 기준 조회 (택배 조회 업체만 구현). 수동 입력 provider 는 없다.
   * 돌려준 이벤트는 창구(gateway)가 하나씩 판정 함수로 넘긴다.
   */
  fetchEvents?(input: { carrier: string; trackingNo: string }): Promise<RawDeliveryEvent[]>
}

export type RawDeliveryEvent = {
  rawStatus: string
  occurredAt: string
  payload?: Record<string, unknown>
}

/**
 * 수동 입력의 원본 값은 사람이 누른 버튼의 코드값이다.
 * 코드값 그대로 또는 화면 라벨(한글)만 받아준다. 그 외는 조회 오류.
 */
function mapManual(raw: string | null | undefined): DeliveryStatus {
  const v = String(raw ?? '').trim()
  if (isDeliveryStatus(v)) return v
  const byLabel = (Object.entries(DELIVERY_STATUS_LABEL) as [DeliveryStatus, string][]).find(
    ([, label]) => label === v,
  )
  return byLabel ? byLabel[0] : 'lookup_error'
}

export const manualAdminProvider: DeliveryTrackingProvider = {
  source: 'manual_admin',
  label: '관리자 입력',
  mapRawStatus: mapManual,
}

export const manualSupplierProvider: DeliveryTrackingProvider = {
  source: 'manual_supplier',
  label: '공급자 입력',
  mapRawStatus: mapManual,
}

const PROVIDERS: Record<string, DeliveryTrackingProvider> = {
  [manualAdminProvider.source]: manualAdminProvider,
  [manualSupplierProvider.source]: manualSupplierProvider,
}

export function getDeliveryProvider(source: string): DeliveryTrackingProvider | null {
  return PROVIDERS[source] ?? null
}

/** events.source 표기 → 화면 문구 */
export function deliverySourceLabel(source: string): string {
  const p = PROVIDERS[source]
  if (p) return p.label
  if (source.startsWith('provider:')) return `택배 조회 (${source.slice('provider:'.length)})`
  return source
}
