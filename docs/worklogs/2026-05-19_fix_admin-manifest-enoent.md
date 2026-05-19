# fix — (admin) page_client-reference-manifest ENOENT

## 작업 목적

Vercel build 시 `.next/server/app/(admin)/page_client-reference-manifest.js` ENOENT 해소.

## 관련 tasks.md ID

- OPS (2026-05-08 admin 라우트 정규화 후속)

## 수정 파일 목록

- `src/app/(admin)/page.tsx` — **삭제**
- `src/app/(admin)/admin/page.tsx` — **신규** (`/admin` → `/admin/dashboard` redirect)

## 변경 내용 요약

- **원인**: `(admin)/page.tsx`가 URL `/`에 매핑되어 `src/app/page.tsx`와 **동일 경로 이중 등록**. 서로 다른 layout(공급자 vs 관리자+Client Sidebar)이 충돌하며, production 빌드에서 `(admin)/page`용 client reference manifest 생성이 깨짐.
- **수정**: 관리자 진입 redirect를 올바른 경로 `(admin)/admin/page.tsx` → URL `/admin`으로 이동. 루트 `/`는 기존 `app/page.tsx`만 유지.
- `force-dynamic` 미사용. payment/automation 로직 변경 없음.

## migration 여부

없음.

## 테스트 결과

- `rm -rf .next node_modules/.cache && npm run build`: **성공**
- 빌드 출력에 `○ /admin` 라우트 확인

## 남은 위험

- `(admin)/policy`, `(admin)/participants` 등 legacy 빈 디렉터리( page 없음)는 유지 — 빌드 영향 없음.

## 다음 권장 작업

- 미사용 `(admin)/policy` 등 orphan 디렉터리 정리(선택).
