# rules.md 커머스 원칙 RULE-27~30 및 FORBIDDEN 보강

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`docs/rules.md`에 커머스·commerce_orders 분리·식당OS 정체성·자동발주 금지를 HARD 규칙으로 고정하고, `[FORBIDDEN]` 목록에 동일 통제를 반영한다.

## 관련 tasks.md ID

- 없음 (문서 작업 — `tasks.md`의 [OPS — AI worklog]에 작업 이력으로 기록)

## 수정 파일 목록

- `docs/rules.md`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_docs_rules-commerce-rules-27-30.md`

## 변경 내용 요약

- `[RULE-26]` 절과 `[FORBIDDEN]` 절 사이에 `[RULE-27]`~`[RULE-30]` 블록을 요청 원문 그대로 추가했다.
- `[FORBIDDEN]` 코드 블록에 RULE-27~30과 대응하는 금지 항목 8줄을 추가했다.

## migration 여부

- 없음 (문서/정책만)

## 테스트 결과

- 미실행 — 문서 변경만 수행

## 남은 위험

- RULE-27~30이 `###` 수준이고 기존 RULE-00~26은 `##` 수준이라 문서 계층이 혼재한다. 필요 시 후속 편집에서 제목 레벨만 정리할 수 있다.

## 다음 권장 작업

- `CONTEXT.md`·스키마 문서에서 `commerce_orders`/`rfq_request_id` 설계 시 본 RULE과 정합 검증.
