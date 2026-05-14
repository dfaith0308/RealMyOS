| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

정무님이 관리자OS `/admin/commerce/orders`에서 **현재 화면에 보이는 storefront 주문**을 공급자에게 넘길 수 있도록, **품목당 1행** 규칙을 지키는 **CSV·실제 XLSX** 보내기를 추가한다. (회계·세무 목적 아님, 금액 컬럼 없음.)

## 관련 `tasks.md` ID

- `COMMERCE-003`

## 수정 파일 목록

- `src/lib/commerce-order-supplier-export.ts` (신규) — 확정 컬럼·CSV(BOM)·파일명·브라우저 다운로드 유틸
- `src/actions/admin/commerce.ts` — `getCommerceOrderSupplierExportRows` (admin + `commerce_orders`·`commerce_order_items` 조인·flatten, `tenants.name` / 실패 시 `tenant_id`)
- `src/components/commerce/OrdersClient.tsx` — CSV/XLSX 버튼, `xlsx` 동적 import로 `.xlsx` 생성
- `docs/tasks.md` — COMMERCE-003 화면 기능·작업 이력
- `docs/worklogs/2026-05-14_feat_commerce-orders-supplier-export.md` (본 파일)

## 변경 내용 요약

- 보내기 대상: **확인 필요 큐 + 현재 필터가 적용된 전체 주문 목록**의 주문 ID 합집합(중복 제거, 목록 표시 순서 보존).
- 서버에서 주문별 `commerce_order_items`를 읽어 **한 품목 = 한 행**으로 펼침. 품목이 없으면 1행(상품명 빈 문자열, 수량 0).
- 식당명: `getCommerceOrders`와 동일하게 `tenants` 테이블 `name`; 조회 실패·빈 이름 시 **`tenant_id` 문자열** (빈 문자열·null 없음).
- 결제상태: DB `payment_status` 값 중 코드에 존재하는 `unpaid` / `paid` / `refunded`는 한글 라벨, 그 외는 원문 문자열.

## migration 여부

없음

## 테스트 결과

- `npm run lint`: 저장소 기존 다른 파일 오류로 전체 실패; **본 변경 파일**에 대한 ESLint 진단은 IDE 기준 문제 없음.

## 남은 위험

- 한 번에 최대 **3000**건 주문 ID만 서버 액션에서 처리(남용·payload 방지). 초과 시 오류 메시지.
- 기간·부분 선택 필터는 미구현(요구사항상 “전체 export”만).

## 다음 권장 작업

- 기간·상태 미리보기 후 export, 또는 선택 체크박스 기반 export.
- 보내기 시 `admin_logs` 기록 여부는 운영 정책에 따라 검토.
