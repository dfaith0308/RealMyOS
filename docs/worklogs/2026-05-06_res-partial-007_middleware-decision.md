# RES-PARTIAL-007 middleware(no-op) 유지 결정

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

식당OS(`resturant_os`)에서 `middleware.ts`가 no-op인 상태가 접근 제어 요구 수준에 미달하는지 평가하고, 보강 필요 여부를 결정한다.

## 관련 tasks.md ID

- RES-PARTIAL-007

## 수정 파일 목록

- `realmyos/docs/tasks.md`
- `realmyos/docs/worklogs/2026-05-06_res-partial-007_middleware-decision.md`

## 변경 내용 요약

- `resturant_os/src/middleware.ts`는 `NextResponse.next()`만 반환하는 no-op임을 확인했다.
- `(app)` 주요 페이지들이 공통으로 `getTenantId()`를 호출해 로그인/온보딩/승인 체크를 강제하는 구조임을 확인했다.
- Edge middleware에서 DB 조회가 어렵고(제약/복잡도 증가), 현재 구조가 요구 수준을 충족한다고 판단해 **현행 유지**로 결정했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 문서 결정 기록만 수행

## 남은 위험 (GAP)

- 접근 제어의 강제 지점이 페이지 단(`getTenantId()` 호출)으로 분산되어 있어, 신규 페이지에서 호출을 누락하면 보호가 약화될 수 있다.
- `NEXT_PUBLIC_TENANT_ID` env override는 개발/데모 편의지만, 운영 환경 오설정 시 승인 체크가 우회될 수 있다.

## 유지 결정 근거

- `getTenantId()`가 인증/온보딩/승인 체크를 담당하는 SSOT로 이미 동작하고 있고, 주요 `(app)` 페이지에서 이를 호출한다.
- Edge middleware에서 DB 기반 승인/역할 판단을 강제하려면 구현 복잡도가 커지고, 현재 단계에서 얻는 이익 대비 비용이 크다.
- 따라서 `middleware.ts`는 no-op 유지하고, 접근 제어는 `getTenantId()` 패턴을 계속 사용한다.

## 다음 권장 작업

- 신규 `(app)` 페이지 추가 시 `getTenantId()` 호출을 규칙으로 강제(리뷰 체크리스트 등).
- 필요 시 middleware는 “로그인 여부” 같은 최소 체크만 하도록 별도 설계 후 도입을 검토한다.

