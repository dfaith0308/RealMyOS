# fix — automation static export prerender 오류

## 작업 목적

Vercel `next build` 마지막 static export 단계에서 `/automation/{history,schedule,scripts}` prerender 실패 해소.

## 관련 tasks.md ID

- tasks-legacy 자동화영업 라우트(미완 placeholder)
- OPS (2026-05-19 payment export 후속)

## 수정 파일 목록

- `src/app/automation/history/page.tsx`
- `src/app/automation/schedule/page.tsx`
- `src/app/automation/scripts/page.tsx`

## 변경 내용 요약

- 빈 `page.tsx`(default export 없음) → 기존 `/sales/*` Server Page re-export.
- 영업 로직·`actions/sales.ts`·Client 직렬화 경로 변경 없음(이미 `/sales`에서 동작 검증됨).
- `force-dynamic` 미사용.

## migration 여부

없음.

## 테스트 결과

- `rm -rf .next && npm run build`: **성공** (exit 0).

## 남은 위험

- `/automation` 인덱스 라우트는 여전히 없음(legacy TODO). 사이드바는 `/sales/*` 직접 링크.

## 다음 권장 작업

- `/automation` 루트 redirect 또는 legacy Sidebar href 정합.
