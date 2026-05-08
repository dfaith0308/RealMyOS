| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

Next.js가 `'use server'` 최상위 모듈에서 async가 아닌 **함수·객체 export**를 허용하지 않아 빌드가 실패하는 문제를 제거한다. 정책 콘솔·연락 액션·메시지 액션을 정리하고, 라우트 그룹으로 인한 `/dashboard` 중복도 해소한다.

## 관련 `tasks.md` ID

감사 ID 직접 변경 없음 — OPS 절차 기록·본 worklog.

## 수정 파일 목록

- `src/lib/policy-utils.ts` (신규)
- `src/lib/policy-setting-defaults.ts` (신규)
- `src/lib/contact-options.ts` (신규)
- `src/lib/sms-byte-length.ts` (신규)
- `src/actions/admin/policy-console.ts`
- `src/actions/admin/trust-engine.ts`
- `src/actions/contact.ts`
- `src/actions/message.ts`
- `src/lib/sales-utils.ts`
- `src/app/(app)/sales/exec/SalesExecClient.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx` (이동·신규 경로)
- `docs/tasks.md`
- `docs/worklogs/2026-05-08_fix-use-server-exports-build.md`

삭제: `src/app/(admin)/dashboard/page.tsx` (공급자 `(app)/dashboard`와 URL 충돌)

## 변경 내용 요약

- `policySettingReasonKey`, `resolveTrustLevel`, `TrustLevelThresholds` → `@/lib/policy-utils`.
- `POLICY_SETTING_DEFAULTS` → `@/lib/policy-setting-defaults` (객체 export 분리).
- `smsByteLength` → `@/lib/sms-byte-length`; 클라이언트는 액션 모듈 대신 lib import.
- `OUTCOME_TYPES` / `CUSTOMER_STATUS_OPTIONS` 및 파생 타입 → `@/lib/contact-options`; `contact.ts`는 타입만 re-export.
- 관리자 중앙 대시보드를 `(admin)/admin/dashboard`로 옮겨 **`/admin/dashboard`** 로 노출, `(app)/dashboard`와 충돌 제거.
- `resturant_os`: `src/actions` 내 동기 `export function` 없음, 기존 빌드 통과 확인(변경 없음).

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` (realmyos): 통과.
- `npm run build` (realmyos): 통과.
- `npx tsc --noEmit` / `npm run build` (resturant_os): 본 작업 전후 변경 없음 — 빌드 통과 확인됨.

## 남은 위험

`(admin)` 라우트 그룹 아래 `/overview`, `/policy` 등은 여전히 URL에 `/admin` 접두사 없이 노출될 수 있음(middleware는 `/admin/*`만 검사). 별도 IA 정리 시 `(admin)/admin/...` 로 일괄 정렬 검토.

## 다음 권장 작업

관리자 라우트를 `/admin/*`로 통일하는 리팩터(사이드바·redirect·middleware와 정합).
