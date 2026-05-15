| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

- 관리자OS `/admin/trades`가 이상 큐 나열 중심이라 거래 1건의 전체 수명을 볼 수 없는 문제(FORENSIC-005)를 해결한다.
- PRODUCT §10-4의 거래 흐름 관제 정의에 맞춰 **RFQ→입찰→낙찰→주문→출고/납품→정산** 타임라인을 드릴다운으로 제공한다.

## 구현 내용

### 1) `/admin/trades/[id]` 신규 (거래 단위 drill-down)

- 라우트: `src/app/(admin)/trades/[id]/page.tsx`
- 입력 `id`는 다음 중 하나로 처리:
  - `orders.id`
  - `rfq_requests.id`
  - `payments.id` (가능하면 `payments.order_id`로 주문에 연결)
- 단계별 표시:
  - 단계명 / 완료일시 / 체류시간(이전 단계→현재) / 이상 여부 / 비고
- 데이터 없는 단계는 **“미완료”**로 표시(빈 화면 금지)

### 2) Action 확장: `getTradeTimeline(id)`

- 파일: `src/actions/admin/trade-monitor.ts`
- 조회 대상:
  - orders (주문 확정)
  - rfq_requests (RFQ 생성)
  - rfq_bids (입찰/낙찰)
  - order_logs (order_status 단계별 완료 시각)
  - payments (type=settlement, order_id 기준 정산)
- 이상 기준(정책키):
  - `rfq_open_duration_hours`: RFQ 생성 후 무입찰 초과 시 플래그
  - `delivery_signal_window`: 주문 확정 이후 미납품 초과 시 플래그
- D-018 준수: 기준값은 `getAdminSettingNumber` 경유

### 3) `/admin/trades` 목록 개선

- 파일: `src/app/(admin)/trades/page.tsx`
- 각 이상 항목에서 `action_options`의 `rfq_id` 또는 `payment_id` 기반으로 **[거래 상세 →]** 링크 제공

## 테스트

- `npx tsc --noEmit`: 통과

## 메모 / 한계

- 주문↔RFQ의 직접 연결 키가 코드/스키마에 명시되지 않은 경우, 주문 기준 드릴다운에서 RFQ 단계는 “데이터 없음/미완료”로 표시될 수 있다(힌트 메시지로 안내).

