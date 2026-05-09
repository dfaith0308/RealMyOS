# CONTEXT.md ARCH-09 커머스 도메인 경계 정의 추가

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`docs/CONTEXT.md` 문서 말미에 커머스 도메인 경계( buy / RFQ / orders )와 `commerce_orders` 분리·traceability, `/buy` 라우트, MVP 테이블, 금지 사항을 아키텍처 기준(ARCH-09)으로 고정한다.

## 관련 tasks.md ID

- 없음 (문서 작업 — `tasks.md`의 [OPS — AI worklog]에 작업 이력으로 기록)

## 수정 파일 목록

- `docs/CONTEXT.md`
- `docs/tasks.md`
- `docs/worklogs/2026-05-09_docs_context-arch-09-commerce-boundary.md`

## 변경 내용 요약

- `docs/CONTEXT.md` 맨 마지막에 `## [ARCH-09] 커머스 도메인 경계 정의` 블록을 요청 원문 그대로 추가했다.
- `docs/tasks.md`의 [OPS — AI worklog]에 본 작업 worklog 링크를 추가했다.

## migration 여부

- 없음 (문서/정책만)

## 테스트 결과

- 미실행 — 문서 변경만 수행

## 남은 위험

- 본 ARCH-09는 제품/규칙 문서의 원칙을 아키텍처 축으로 고정한 것으로, 실제 스키마/라우트 구현은 별도 작업에서 RULE-26 및 RULE-27~30 준수 하에 진행되어야 한다.

## 다음 권장 작업

- 커머스 도메인 구현 착수 시 `docs/rules.md` RULE-27~30 및 `docs/PRODUCT.md` §12·§13과 함께 본 ARCH-09를 SSOT로 삼아, 스키마(`commerce_orders` 등)와 라우트(`/buy` 진입점) 정합을 확인한다.

