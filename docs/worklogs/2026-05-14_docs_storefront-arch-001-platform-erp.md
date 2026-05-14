# STOREFRONT-ARCH-001 — 플랫폼 주문 ↔ 관리자OS ERP 문서 정렬

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

디닷페이스(플랫폼)·해내음코리아(fulfillment 예시) 기준으로 **storefront 플랫폼 주문 ownership**, **관리자OS = 디닷페이스 ERP**, **공급자 = fulfillment** 를 `PRODUCT.md`·`CONTEXT.md`·`tasks.md`에 정렬한다. 코드·migration·DB 변경 없음.

## 2. 관련 `tasks.md` ID

- `STOREFRONT-ARCH-001` (본 작업·OPS 이력)
- **`[PLATFORM-ERP-001]`** (신규 설계 Epic)

## 3. 수정 파일 목록

- `docs/PRODUCT.md`
- `docs/CONTEXT.md`
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_docs_storefront-arch-001-platform-erp.md` (본 파일)

## 4. 변경 내용 요약 (보고 SECTION 대응)

### SECTION 1 — PRODUCT.md

- §2 공급자: **Storefront 고객 owner ≠ 공급자** 명시.
- §5 관리자OS: **디닷페이스 ERP** 확장 정의 + `PLATFORM-ERP-001` 링크.
- §10-1: 관리자OS **플랫폼 ERP** 보강.
- §12 `commerce_orders` 분리: **플랫폼 주문·자동 ERP 동기화** 목표 문장.
- §13 Storefront: 디닷페이스·해내음·**platform order**·흐름 다이어그램·Lifecycle 4단계 문구 정리.

### SECTION 2 — CONTEXT.md

- `commerce_orders` 표 행: owner·fulfillment allocation 반영.
- [ARCH-08A]: **플랫폼 운영센터 + ERP** 확장.
- [ARCH-09]: **Platform Order → Fulfillment → Settlement** 절 추가; `commerce_orders` 절에 플랫폼 주문·자동 동기화 문단(이전 턴 일부 반영 후 보강).

### SECTION 3 — 관리자OS 역할 재정의

- PRODUCT §5·§10-1 및 CONTEXT [ARCH-08A]: 관제 + **플랫폼 주문·매출·미수·allocation·공급자 정산·수수료·PG** 축.

### SECTION 4 — Platform Order 구조

- PRODUCT §13 `1-1`, CONTEXT 다이어그램: **Event → ERP Auto Sync → Supplier Fulfillment → Supplier Settlement**.

### SECTION 5 — tasks.md Epic

- **`[PLATFORM-ERP-001]`** 신설(설계 진행 중, 구현 완료 표현 없음).
- 문서 사용법 **15번**·OPS 이력.
- `ADM-TODO-001`에 **문서 갱신** 한 줄(과거 “없음” vs `ADM-CHECK-001` 현행).

### SECTION 6 — 문서 일관성

- “공급자가 storefront 고객 owner”로 읽히던 §13 구절 제거·대체.
- `ADM-TODO-001` vs `ADM-CHECK-001` 충돌을 **문서 주석으로 명시**.

## 5. migration 여부

없음.

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- 코드·원장은 아직 `commerce_orders` ↔ 공급자 `orders`/`payments` **단일화 전** — Epic으로 후속 관리.

## 8. 다음 권장 작업

- `PLATFORM-ERP-001` 하위 과제 분해·`COMMERCE-*`와 중복 제거 검토.
