# fix — payment.ts Server Action export 오류

## 작업 목적

Vercel production build 실패 원인(`'use server'` 파일의 sync `export const`) 제거.

## 관련 tasks.md ID

- OPS (2026-05-08 use-server export 정리 후속)

## 수정 파일 목록

- `src/actions/payment.ts`

## 변경 내용 요약

- `export const PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR` → 파일 내부 `const` (외부 미사용, export 불필요).
- 결제 RPC·금액·취소 분기 로직 변경 없음.

## migration 여부

없음.

## 테스트 결과

- `payment.ts` 관련 webpack 오류: **해소** (`Compiled successfully`).
- `npm run build` 전체: **실패** — `src/app/automation/{history,schedule,scripts}/page.tsx` 빈 파일로 prerender 오류(본 커밋 범위 외).

## 남은 위험

- automation placeholder 페이지 미구현 시 Vercel `next build` prerender 단계에서 계속 실패 가능.

## 다음 권장 작업

- automation 3개 `page.tsx`에 최소 Server Component default export 추가 또는 라우트 제거.
