# SUP-PARTIAL-002 — 견적 IA를 독립 메뉴(`/quotes`)로 승격

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-5의 “견적관리 독립 메뉴” 정의에 맞춰, 기존 `/orders/quotes/*` 하위에 있던 견적 라우트를 `/quotes/*`로 승격하고 메뉴(IA)를 독립 그룹으로 이동한다. 기존 링크/북마크 보존을 위해 구 경로는 redirect로 유지한다.

## 관련 tasks.md ID

- SUP-PARTIAL-002

## 수정 파일 목록

- `src/app/(app)/quotes/page.tsx`
- `src/app/(app)/quotes/new/page.tsx`
- `src/app/(app)/quotes/[id]/page.tsx`
- `src/app/(app)/orders/quotes/page.tsx`
- `src/app/(app)/orders/quotes/new/page.tsx`
- `src/app/(app)/orders/quotes/[id]/page.tsx`
- `src/app/(app)/orders/quotes/QuoteListClient.tsx`
- `src/app/(app)/orders/quotes/QuoteCreateClient.tsx`
- `src/app/(app)/orders/quotes/QuoteDetailClient.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/actions/quote.ts`
- `docs/tasks.md`

## 변경 내용 요약

- `/quotes/*` 라우트를 신설하고, 기존 구현(클라이언트 컴포넌트/액션)을 재사용하도록 구성했다.
- 기존 `/orders/quotes/*` 라우트는 각각 `/quotes/*`로 redirect하도록 교체해 **기존 링크를 보존**했다.
- 사이드바에서 “견적관리”를 주문관리 하위에서 분리해 **독립 메뉴 그룹**으로 이동하고, 링크를 `/quotes`로 변경했다.
- `revalidatePath('/orders/quotes')`를 유지하면서 `revalidatePath('/quotes')`를 추가해 **신/구 경로를 함께 invalidate** 하도록 했다.
- 클라이언트 링크/네비게이션을 `/orders/quotes` → `/quotes`로 정리했다.

## migration 여부

- 없음

## 테스트 결과

- 미실행 — 이유: 로컬 실행/브라우저 수동 검증을 본 작업 범위에 포함하지 않음.

## 남은 위험

- `/quotes/*` 신설로 메뉴/라우트는 정합해졌지만, PRODUCT §6-5의 “견적현황” 화면(탭 기반 트리거)과 전송 이력 등은 별도 범위로 남아 있음.
- redirect가 Next.js 라우팅 레벨에서 동작하므로, 내부에서 하드코딩된 `/orders/quotes/*` 링크가 추가로 발견되면 다시 정리 필요.

## 다음 권장 작업

- `SUP-PARTIAL-002-B`(견적현황 탭 화면)부터 진행하면서 `/quotes/status`(또는 동등 경로)와 탭 기준(전환 필요/임박/부분전환/만료)을 PRODUCT 정의대로 구현한다.

