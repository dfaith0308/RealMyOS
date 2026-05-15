| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

# CONTEXT.md storefront·반복주문 구조 보완

## 작업 목적

`docs/CONTEXT.md`를 현재 저장소에서 확인된 storefront(commerce) 구조와 `PRODUCT.md` §13·학습 파이프라인 문구에 맞춰 갱신한다.

## 관련 `tasks.md` ID

없음 (문서 전용).

## 수정 파일 목록

- `docs/CONTEXT.md` — ARCH-00 거래 생성 분기, ARCH-03 테이블 인벤토리·restaurant-os 표·relationships 역할, ARCH-09 buy 경계 문구
- `docs/tasks.md` — 작업 이력 1행
- `docs/worklogs/2026-05-14_docs_context-storefront-alignment.md` — 본 파일

코드 변경 없음.

## 변경 내용 요약

- [ARCH-00] 거래 생성: RFQ 경로와 Storefront Direct Order 경로를 병기.
- [ARCH-03] `cart_items`·`commerce_*`·`shipping_groups`를 인벤토리 문자열에 반영, 합계 75개로 갱신(추가 테이블 5개 기준).
- [ARCH-03] restaurant-os 표에 `commerce_orders` 등 5행 추가 — 근거는 migration·`buy.ts`·`commerce.ts`·`rfq.ts` 등 확인된 경로만 기술.
- `relationships`에 PRODUCT 기준 **구조적 역할** 문단 추가(구현 완료 단정 없음).
- [ARCH-09] `buy ↔ RFQ ↔ commerce_orders` 절에 Storefront vs RFQ 짧은 정의 추가.
- `payments_outgoing` 구버전 주석은 restaurant-os 절 하단에 **유지 복구**.

## migration 여부

없음.

## 테스트 결과

문서만 수정. `npx tsc` 미실행(문서 작업만).

## 남은 위험

- 동일 문서 내 `### commerce_orders 구조` 절의 필드 예시는 본 작업에서 검증·수정하지 않았으며 migration·실DB와 불일치할 수 있음(별도 정합 과제).

## 다음 권장 작업

- `commerce_orders 구조` 소절을 `20260509010000_create_commerce_tables.sql` 및 `commerce-constants.ts`와 대조해 정리.
