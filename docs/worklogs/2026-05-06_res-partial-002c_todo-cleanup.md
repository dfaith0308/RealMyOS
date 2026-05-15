# RES-PARTIAL-002-C — 주문 상세 TODO 문구 제거

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

주문 확정 RPC가 `restaurant_order_items` 라인 스냅샷을 생성하도록 갱신된 이후, 주문 상세 화면의 “order_items 채워지도록 점검” TODO 문구는 더 이상 유효하지 않다. RULE-13(완성된 코드만 납품) 기준에 따라 TODO 문구만 제거하고, 빈 배열 처리 로직은 유지한다.

## 관련 tasks.md ID

- RES-PARTIAL-002-C

## 수정 파일 목록

- `resturant_os/src/app/(app)/orders/[id]/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-002c_todo-cleanup.md`

## 변경 내용 요약

- `order_lines.length === 0` empty state에서 노출되던 TODO 안내 문구(주석 포함)를 제거했다.
- 빈 배열 처리 로직(“주문 품목이 없습니다.”)은 그대로 유지했다.

## migration 여부

- 없음

## 테스트 결과

- linter: `resturant_os/src/app/(app)/orders/[id]/page.tsx` 진단 결과 오류 없음

## 남은 위험

- 과거에 생성된 주문 중 `restaurant_order_items`가 비어있는 데이터는 여전히 “주문 품목이 없습니다.”로 보일 수 있다(데이터 소급 생성은 별도 작업).

## 다음 권장 작업

- 주문 확정/상세 표시 플로우를 한 번 수동으로 점검해(신규 RFQ 확정 → 주문 상세 진입) 라인이 정상 표시되는지 확인한다.

