| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-10 |

## 작업 목적

Next.js `'use server'` 모듈은 비동기 서버 액션 함수(및 타입 export)만 허용하는데, `commerce.ts`에서 `export const LISTING_SHIPPING_TYPES`(객체)가 남아 런타임 오류가 발생했다. `realmyos`·`resturant_os`의 `src/actions/`를 같은 규칙으로 전수 확인한다.

## 관련 `tasks.md` ID

OPS — AI worklog (기존 2026-05-08 `use server` 분리 이력과 동일 계열)

## 수정 파일 목록

- `src/lib/commerce-constants.ts`
- `src/actions/admin/commerce.ts`

**전수 확인만 (변경 없음)**: `realmyos/src/actions/` 나머지 전부, `resturant_os/src/actions/` 전부, `resturant_os` 기타 `'use server'` 파일(`lib/supabase-server.ts`, `lib/admin-settings-read.ts`).

## 변경 내용 요약

- `LISTING_SHIPPING_TYPES`·`ListingShippingType`를 `commerce-constants.ts`로 이동.
- `commerce.ts`는 상수를 import하고 `ListingShippingType`만 `export type { … }` 재수출.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` + `npm run build`: **realmyos** pass
- `npx tsc --noEmit` + `npm run build`: **resturant_os** pass (코드 변경 없음)
- 실제 브라우저로 `/admin/commerce/*`, `/buy`, `/today`, `/rfq` 접속: **미실행** (로컬 서버·세션 미구동; 빌드로 라우트 컴파일 확인)

## 남은 위험

- `'use server'` 파일에 동기 `export function`·`export const`가 다시 들어가면 동일 오류 재발 가능. PR 리뷰 시 export 목록 확인 권장.

## 다음 권장 작업

- CI에 `next build` 또는 `tsc`로 회귀 방지 유지.
