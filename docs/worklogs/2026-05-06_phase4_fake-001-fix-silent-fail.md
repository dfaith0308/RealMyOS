# Phase 4 — FAKE-001 오류 성공 위장 제거

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

오류가 발생했는데도 `success: true`로 빈 배열을 반환하는 “성공 위장” 패턴을 제거해, 호출자가 **오류와 “데이터 없음”** 을 구분할 수 있게 한다.

## 관련 tasks.md ID

- SUP-FAKE-001
- RES-FAKE-001

## 수정 파일 목록

- `realmyos/src/actions/ledger.ts`
- `resturant_os/src/actions/restaurant.ts`
- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_phase4_fake-001-fix-silent-fail.md`

## 변경 내용 요약

- `SUP-FAKE-001`: `getCustomersWithStats`에서 예외 발생 시 `success: true, data: []` 반환을 제거하고, `success: false`로 오류를 반환하도록 변경했다.
- `RES-FAKE-001`: `getMenus`에서 조회 에러가 있어도 빈 배열 성공을 반환하던 로직을 제거하고, `success: false`로 오류를 반환하도록 변경했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 단순 반환 형태 변경이지만 로컬/CI 테스트는 수행하지 않았다.

## 남은 위험

- 일부 호출부가 과거의 “빈 배열 성공”을 전제로 동작하고 있었다면, UI에서 오류 처리가 노출될 수 있다(의도된 정정).

## 다음 권장 작업

- 해당 액션들의 호출 UI에서 실패 시 에러 메시지 표기/리트라이 UX가 적절한지 점검한다.

