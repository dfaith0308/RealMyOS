| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

FORENSIC §7에 적힌 CONTEXT/tasks 드리프트를 해소하기 위해 `CONTEXT.md`를 운영 DB 인벤토리·저장소 migration 실측·관리자OS 라우트·미들웨어 보호 기준으로 갱신한다.

## 관련 `tasks.md` ID

- `ADM-CHECK-001` (종결)
- `FORENSIC.md` §7

## 수정 파일 목록

- `docs/CONTEXT.md` ([ARCH-02]~[ARCH-08G], [ARCH-03] 테이블·migration 수·relationships 서술)
- `docs/tasks.md` (migration 인벤토리 표·`DB-DANGER-001` 확인 내용·`ADM-CHECK-001`)
- `docs/FORENSIC.md` (§7 완료·헤더·처리 순서)

## 변경 내용 요약

- 운영 테이블 70개 나열·`supabase/migrations` **35** 파일 실측.
- 관리자 라우트 9경로 명시·`src/middleware.ts` 의 `users.role === 'admin'` 서술.
- `relationships` 신뢰 엔진·participants 라우트 반영.

## migration 여부

없음.

## 테스트 결과

해당 없음.

## 남은 위험

`_etl_*`·레거시 테이블은 코드 참조와 무관 — 실사 시 DROP 금지 원칙 유지.

## 다음 권장 작업

집계 표에서 관리자OS 「확인 필요」 건수가 줄었는지 `tasks.md` 상단 표 교차 검증.
