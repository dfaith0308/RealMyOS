# TEST-RUN-001 — 운영 테스트 실행 가이드 문서화

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`docs/TEST.md`의 검증 항목을 정무님이 **브라우저에서 순서대로 실행**할 수 있도록, 실제 저장소 경로·액션명·테이블명만 근거로 한 **운영 테스트 실행 가이드**(`docs/TEST-DEV/TEST-RUN-001.md`)를 신규 작성한다.

## 2. 관련 `tasks.md` ID

- **TEST-RUN-001** (문서 식별자; 감사 ID 블록은 OPS·문서 사용법에 연계)

## 3. 수정 파일 목록

- `docs/TEST-DEV/TEST-RUN-001.md` (신규)
- `docs/tasks.md` (문서 사용법·OPS 작업 이력)
- `docs/worklogs/2026-05-14_docs_test-run-001-operational-guide.md` (본 파일)

## 4. 변경 내용 요약

- STEP 0~8, 각 STEP별 PASS·실패 시(증상·확인·임시 대응), 비가역 원칙 별도 섹션, 결과 기록 템플릿 포함.
- 구현 미완(카드 결제)은 가이드에서 **제외** 명시. `ListingEditClient` 는 **목록으로/취소 confirm + beforeunload** 까지 기술하고, **`popstate` 없음**으로 브라우저 뒤로가기 전용 confirm은 문서화하지 않음.

## 5. migration 여부

없음.

## 6. 테스트 결과

- 코드·스키마 변경 없음. `npx tsc` 등은 **미실행**(문서만).

## 7. 남은 위험

- RFQ·비가역 항목은 **경로를 고정하지 않고** `docs/TEST.md`와 육안 검증에 맡김(빌드별 라우트 차이).

## 8. 다음 권장 작업

- `TEST-RUN-001` 실행 후 발견 사항을 `docs/TEST.md`의 `[!]`·증거 칸에 반영.
