# tasks.md 커머스 과제 COMMERCE-000~007 등록

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-09 |
| **차단 사유** | 해당 없음 |

## 작업 목적

플랫폼 커머스(Listing·주문·식당OS `/buy`) 구현 전에 실행 순서·선행 조건·상태머신·DDL 스펙을 `tasks.md`에 고정해, DB·관리자OS·식당OS 작업이 같은 기준을 따르도록 한다.

## 관련 `tasks.md` ID

`COMMERCE-000` ~ `COMMERCE-007` (신규). OPS 작업 이력에 본 worklog 링크 추가.

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-09_docs_tasks-commerce-000-007.md` (본 파일)

코드 변경 없음.

## 변경 내용 요약

- `## [커머스]` 섹션 신설: 상태 전이·결제 분기·timeout·4테이블 migration 스펙·관리자/식당OS 화면·사이드바·결제 연동·`/today` 진입(RULE-29)까지 `COMMERCE-000`~`007` 본문 등록.
- `## [OPS — AI worklog]`에 작업 이력 한 줄 추가.
- `## 감사 요약 (집계)`: 집계 규칙에 `COMMERCE-*` 별도 축 명시, 접두사별 건수에 `COMMERCE-` 8건·본문 ID 합계 82로 갱신, 교차 검증 표에 `COMMERCE-` 행·합계 82 반영, 유형 합 주석에 커머스 별도 축 추가.
- `## 실행 로드맵`: **Phase 8 — 커머스** 블록 추가(의존 순서 요약).

## migration 여부

없음 (문서만).

## 테스트 결과

미실행 — 문서 편집만 해당.

## 남은 위험

- `COMMERCE-000`의 상태 플로우는 아직 별도 단일 SSOT 문서 파일로 뽑히지 않았고, 본 등록은 `tasks.md` 내 요약에 머무름. 후속에서 PRODUCT/CONTEXT 연계 문서로 이관할지 합의 필요.
- `admin_logs`·`AdminSidebar`·`/admin/commerce/*`는 미구현; 실제 구현 시 RLS·권한·감사 필수 항목과 정합 재검증 필요.

## 다음 권장 작업

1. `COMMERCE-000` 완료 기준에 맞춰 상태머신을 `docs/PRODUCT.md` 또는 전용 설계 문서에 옮겨 SSOT를 단일화한다.
2. `COMMERCE-001` migration 초안을 `realmyos/supabase/migrations/` 거버넌스에 맞게 작성·리뷰한다.
