| 필드 | 값 |
|------|-----|
| **상태** | 부분완료 |
| **완료일** | 2026-05-09 |

## 작업 목적

`/admin/commerce/products/new` 하단 CTA(취소·임시저장·저장 후 다음 상품·저장 후 공개)의 **실행 경로를 개발 환경에서 추적**할 수 있도록 `ListingNewClient.tsx`에 단계별 `console.log`를 추가하고, 검증 실패·서버 액션 실패 시 **무음 종료(silent fail)를 줄이기 위해** `showToast` / `console.error`를 보강한다. `createListingFull` 본문·라우터 구조·UI/CSS는 변경하지 않음.

## 관련 `tasks.md` ID

`COMMERCE-002`

## 수정 파일 목록

- `src/components/commerce/ListingNewClient.tsx`

## 변경 내용 요약

- `ctaDebugLabel`로 DRAFT / NEXT / PUBLIC 프리픽스 매핑.
- `submitWithStatus`: STEP 2~9(개발 전용 로그), 검증 실패 시 `showToast`, `createListingFull` 실패·throw 시 `console.error` + `showToast`.
- 취소: `Link` 클릭 시 STEP 1~2 로그(목록은 `href` 네비게이션).
- 저장 계열 버튼: STEP 1 클릭 로그 후 `submitWithStatus` 호출.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit`: **PASS** (exit 0)
- 브라우저에서 CTA 4종 클릭·Network 탭 server action 확인: **미실행** (로컬 dev에서 후속 확인 필요)

## 남은 위험

- 성공 후 클라이언트는 `router.refresh()`만 호출하고 **`router.push('/admin/commerce/products')`는 없음** — 기대가 “저장 후 목록 이동”이면 제품 기대와 불일치할 수 있음.
- 로그 단계 번호는 코드상 **STEP 4 검증 → STEP 3 페이로드** 순(논리 순서); 사용자가 제시한 번호 순서와 표기만 다를 수 있음.

## 다음 권장 작업

1. `npm run dev`에서 CTA별로 콘솔 STEP 1~9와 Network의 Next.js server action 요청(상태 코드·응답)을 기록한다.
2. 기대 UX가 “저장 후 목록”인지 “동일 페이지 유지”인지 확정한 뒤, 승인 시에만 라우팅을 조정한다.
