# SUP-TODO-001-E — RFQ 계약·후속 흐름 (Phase 5 문서화)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

PRODUCT.md §6-2 **계약 생성 흐름(MVP)** 및 **상태 흐름**·알림 정의를 정독하고, Phase 5에서 **코드 없이** “지금 실장 가능한 것”과 “별도 설계·DB·RPC가 필요한 것”을 구분해 `SUP-TODO-001-E` 및 상위 `SUP-TODO-001` Phase 5 종료 근거를 남긴다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-E` / `SUP-TODO-001` (Phase 5 분해 A~E 종료)

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-todo-001e_rfq-contract.md`

코드 변경 없음.

## 변경 내용 요약

### §6-2 정독 요지 (발췌)

- **상태 흐름(완전 정의)**: `open` → … → `selected` → **`contract_pending`** → **`paid`** → **`address_revealed`** → 납품·정산·`completed` 등; 예외 `expired` / `cancelled` / `disputed`.
- **계약 MVP**: 입찰 확정 조건을 담는 전자 합의 데이터; 계약서 필드(품목·수량·단가·총액·납기·정산·취소·분쟁); **체크박스 + [동의 및 진행]** (공급자·식당 각각); 흐름 **`selected` → `contract_pending` → (양측 동의) → `paid`**.
- **낙찰 시**: 알림, 계약 생성·`contract_pending`, "선정/계약" 탭 이동(UX).
- **알림 표**: 계약 요청(`contract_pending`), 결제 완료·주소 공개(`paid`), 납품·정산 등 상태 전이 기반.

### 현재 구현·정합 가능한 것 (기존 자산 위주)

- **발주 확정**: 식당OS `accept_bid_and_create_order_atomic` + `rfq_requests.status = ordered`, 낙찰 입찰 `accepted`·기타 `rejected` — 이미 운영 경로 존재.
- **주문·지불 스냅샷**: RPC가 `orders`·`payments` 등 생성 — **단, PRODUCT의 `selected` / `contract_pending` / `paid` RFQ 단계와 1:1 대응하지 않을 수 있음** (현행은 `ordered` 중심).
- **공급자 알림 MVP**: 낙찰/탈락 `notifications` — `SUP-TODO-001-D` 반영.

### 별도 설계·스키마·다중 화면이 필요한 것

- **`contract_pending` 상태 및 계약 엔티티**: RFQ/주문과 분리된 **합의 기록** 저장소(버전·동의 시각·동의 주체), 또는 RFQ/주문 확장 컬럼 — **migration·RLS·RULE-19 RPC** 검토.
- **양측 동의 UI**: 공급자OS·식당OS 각각 계약 화면, 동의 순서·재동의·분쟁 플로우.
- **`paid` 이후 주소 공개**: 개인정보·노출 게이트 — `address_revealed` 전환 조건, 필드 마스킹, 감사 로그.
- **§6-2 나머지 알림**: 계약 요청·결제·납품·정산 등 — 트리거 지점·`notifications`·중복 정책(§8-7).
- **`supplier_bid_viewed`**: 이벤트 스키마·식당 UI·공급자 알림 연동.
- **입찰 상태 세분화**: `counter_offered`·`selected` 등 — 현재 DB enum/앱 상태와 PRODUCT 완전 정의 정합.

## migration 여부

없음 (문서만).

## 테스트 결과

코드 변경 없음 — `npx tsc` 등 **미실행** (해당 없음).

## 남은 위험

- Phase 5 종료가 **PRODUCT §6-2 전체 동등**을 의미하지 않음. 후속 작업 시 상태 모델·용어(`ordered` vs `selected`/`contract_pending`) 정본을 먼저 고정할 것.

## 다음 권장 작업

- 계약 MVP를 별 감사 ID로 분해(스키마·양측 동의·알림).
- RFQ 상태 enum과 `orders`/`payments` 라이프사이클 매트릭스 문서화(SSOT).
