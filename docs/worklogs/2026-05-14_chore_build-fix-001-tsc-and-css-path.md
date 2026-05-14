| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

관리자 storefront 무통장 페이지의 **잘못된 CSS 모듈 상대 경로**로 인한 `Module not found`를 제거하고, **realmyos·resturant_os** 전역 `tsc --noEmit`으로 추가 오류가 없는지 확인한다.

## 관련 `tasks.md` ID

- **BUILD-FIX-001**

## 수정 파일 목록

- `src/app/(admin)/admin/commerce/storefront-bank/page.tsx`
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_chore_build-fix-001-tsc-and-css-path.md` (본 파일)

## 변경 내용 요약

- `admin-shared.module.css` 실제 위치: `src/app/(admin)/admin-shared.module.css`. 페이지는 `admin/commerce/storefront-bank/` 이므로 동일 깊이의 `orders/page.tsx`와 같이 **`../../../admin-shared.module.css`** 로 통일.
- `realmyos`: `npx tsc --noEmit`, `npm run build` 실행 — 통과.
- `resturant_os`: `npx tsc --noEmit` 실행 — 통과(추가 수정 없음).

## migration 여부

- 없음

## 테스트 결과

- `cd realmyos && npx tsc --noEmit` — exit 0  
- `cd realmyos && npm run build` — Compiled successfully  
- `cd resturant_os && npx tsc --noEmit` — exit 0  

## 남은 위험

- `next build`가 `Skipping validation of types`로 설정된 경우 별도 `tsc`로 타입 검증 유지 필요.

## 다음 권장 작업

- CI에서 `tsc` + `next build` 병행 고정.

---

## SECTION 1 — 발견된 전체 오류 목록

| 파일 | 오류 | 영향도 |
|------|------|--------|
| `src/app/(admin)/admin/commerce/storefront-bank/page.tsx` | `Module not found: Can't resolve '../../admin-shared.module.css'` (Next 번들) | **높음** — `/admin/commerce/storefront-bank` 빌드 실패 |
| (전수 `tsc`) | 추가 TypeScript 오류 없음 | — |

## SECTION 2 — 수정 내용

| 파일 | 수정 전 | 수정 후 |
|------|---------|---------|
| `storefront-bank/page.tsx` | `import s from '../../admin-shared.module.css'` | `import s from '../../../admin-shared.module.css'` |

## SECTION 3 — 수정 후 tsc / build 결과

- `realmyos` `npx tsc --noEmit`: **오류 0**
- `realmyos` `npm run build`: **성공**
- `resturant_os` `npx tsc --noEmit`: **오류 0**

## SECTION 4 — 수정하지 못한 오류

- 해당 없음.
