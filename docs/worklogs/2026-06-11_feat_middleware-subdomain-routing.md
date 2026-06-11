# 서브도메인 분기 미들웨어 (app/admin.siksiki.com)

| 항목 | 내용 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-06-11 |
| **브랜치** | `dev` |

## 작업 목적

운영 도메인 `app.siksiki.com`(공급자OS)과 `admin.siksiki.com`(관리자OS)을 Host 헤더로 분기한다. localhost·Vercel 프리뷰는 기존 동작 유지.

## 관련 `tasks.md` ID

- 문서 사용법 — 배포·도메인 라우팅

## 수정 파일 목록

- `src/middleware.ts`
- `docs/tasks.md`, 본 worklog

## 변경 내용 요약

- `admin.*` 호스트: 비공개 경로를 `/admin` prefix로 `rewrite` (루트 → `/admin/dashboard`).
- `app.*` 호스트: `/admin/*` 접근 시 `/dashboard`로 `redirect`.
- Supabase SSR 쿠키·세션·admin role 체크 기존 로직 유지.

## migration 여부

없음

## 테스트 결과

- `npx tsc --noEmit` — **pass**
- 실제 `admin.siksiki.com` / `app.siksiki.com` DNS·Vercel 도메인 연동 — 미실행

## 남은 위험

- `admin.*` rewrite가 `NextResponse.rewrite` 단독 반환 — Supabase 쿠키 갱신 응답과 분리될 수 있음(기존 패턴과 동일한 redirect 경로도 plain `NextResponse.redirect` 사용).
- `admin.localhost` 등 개발용 서브도메인 미설정 시 로컬에서는 분기 미적용.

## 다음 권장 작업

- Vercel에 `app`/`admin` 서브도메인 등록 후 스모크 테스트.
- rewrite 응답에 `supabaseResponse` 쿠키 병합 필요 시 별도 chore.
