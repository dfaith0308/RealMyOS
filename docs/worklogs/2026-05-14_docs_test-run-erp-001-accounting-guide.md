| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

storefront → ERP 축에서 **회계 숫자 정합성·중복 방지·취소·RLS**를 손으로 검증할 수 있도록 **`docs/TEST-RUN-ERP-001.md`** 를 신규 작성하고, `TEST.md`·`TEST-RUN-001.md`·`tasks.md`에 상호 참조를 남긴다. 코드·DB·migration 변경 없음.

## 관련 `tasks.md` ID

- **TEST-RUN-ERP-001** (문서)·**`[PLATFORM-ERP-001]`** Epic 연계(운영 검증)·OPS 작업 이력

## 수정 파일 목록

- `docs/TEST-RUN-ERP-001.md` — 신규
- `docs/TEST.md` — §8 ERP 체크리스트·주문 처리 항목에 ERP 가이드 링크
- `docs/TEST-RUN-001.md` — 참조 표·말미에 TEST-RUN-ERP-001 수행 권고
- `docs/tasks.md` — 문서 인벤토리 번호 정리·OPS·`[PLATFORM-ERP-001]` 작업 이력

## 변경 내용 요약

- ERP 회계 검증 STEP 0~8, PASS/FAIL 가이드, SQL, 기록 템플릿.
- **미구현** `commerce_allocation_manual_review_required` 는 문서에 **명시적으로 부재** 처리하고, confirmed+cancel 시나리오는 **현행 코드 동작** 기준으로 서술.

## migration 여부

없음 (문서만).

## 테스트 결과

해당 없음 (문서 작성만). `npm run build` 등 코드 실행 변경 없음.

## 남은 위험

- 운영 DB 스키마·정책이 저장소와 어긋나면 SQL 일부가 실패할 수 있음 — STEP 0에서 migration 적용 여부를 먼저 확인하도록 안내함.

## 다음 권장 작업

- 정무님이 TEST-RUN-001 완료 후 TEST-RUN-ERP-001을 실제 실행하고, 결과를 worklog·이슈에 누적.
