| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

TEST-RUN-002: `commerce_orders` → `payments` P0 연결을 **운영 리허설**에서 순서대로 검증할 수 있도록 `docs/TEST-DEV/TEST-RUN-001.md`에 **STEP 8**을 추가하고, 기존 데이터 정리 절을 **STEP 9**로 번호 조정한다. `docs/TEST.md`에 동일 맥락 체크리스트·migration 점검 항목을 추가한다. **테스트 실행·코드 변경 없음.**

## 2. 관련 `tasks.md` ID

- **TEST-RUN-002** (문서 사용법 항목 19) · 연계: **PLATFORM-ERP-P0-001**, `docs/TEST-DEV/TEST-RUN-001.md`, `docs/TEST.md`

## 3. 수정 파일 목록

- `docs/TEST-DEV/TEST-RUN-001.md` — STEP 8(ERP bridge)·STEP 9(데이터 정리)·참조 표 보강
- `docs/TEST.md` — 관리자 주문 처리 체크 1줄, MIGRATION `20260515100000…` 1줄
- `docs/tasks.md` — 문서 사용법 19·OPS·`[PLATFORM-ERP-001]` 작업 이력
- `docs/worklogs/2026-05-14_docs_test-run-002-storefront-payments-bridge.md` (본 파일)

## 4. 변경 내용 요약

- STEP 8: 사전 조건(migration·무통장·상품·식당 계정), 4단 실행 순서, SQL 검증, PASS/FAIL CASE, 기록 템플릿.
- STEP 9: 기존 STEP 8「테스트 데이터 정리」본문 유지·제목만 변경.
- `TEST.md`: `paid` 후 `payments`·`commerce_order_id` 자동 생성 확인 항목; migration 목록에 P0 bridge 파일 추가.

## 5. migration 여부

없음(문서만).

## 6. 테스트 결과

해당 없음(문서만).

## 7. 남은 위험

- STEP 8은 **DB에 `20260515100000…` 적용 후**에만 의미 있다 — 미적용 시 CASE 1·2로 수렴.

## 8. 다음 권장 작업

- 운영 DB migration 적용 후 STEP 8 **1회 리허설** 기록.
