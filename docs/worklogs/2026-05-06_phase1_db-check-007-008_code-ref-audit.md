# Phase 1 — DB-CHECK-007/008 코드 참조 감사

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

Phase 1 미완료 항목 중 `DB-CHECK-007`, `DB-CHECK-008`을 코드 검색 근거로 종결한다. (코드/DB 변경 없이 “현행 코드가 해당 테이블을 참조하는지”만 확정)

## 관련 tasks.md ID

- DB-CHECK-007
- DB-CHECK-008

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_phase1_db-check-007-008_code-ref-audit.md`

## 변경 내용 요약

- `realmyos/src`, `resturant_os/src`에서 ETL 테이블 7개(`_etl_*`) 문자열/테이블 참조를 검색해 **참조 0건**을 확인하고 `DB-CHECK-007`을 닫았다.
- `realmyos/src/actions/fund.ts`에서 `accounts`, `account_purposes`의 **직접 조회/쓰기**를 확인하고 `DB-CHECK-008`을 닫았다. (`resturant_os/src`에서는 참조 0건)
- PRODUCT `6-12. 자금관리`의 `accounts` 입력 항목과 `fund.ts`의 사용 필드 대응을 “코드 근거로만” 기록했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 코드 변경 없음(검색 및 문서 갱신만 수행)

## 남은 위험

- 운영 DB에 존재하는 ETL 테이블이 **현재 앱 코드에서 미참조**라고 해서, 배치/외부 시스템이 미사용이라고 단정할 수는 없음(코드베이스 밖 프로세스 가능).

## 다음 권장 작업

- Phase 1 미완료 항목인 `DB-TODO-001/002/003`을 `tasks.md` 기준으로 순서대로 처리한다.

