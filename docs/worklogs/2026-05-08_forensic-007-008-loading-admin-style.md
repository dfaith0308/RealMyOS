| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

1. **`DB-TODO-001`** — 운영 DB에서 `settings_logs` 실존·컬럼·RLS를 사용자 제공 기준으로 **`tasks.md` 종결** 처리한다.  
2. **`FORENSIC-007`** — `(app)`·`(admin)` 지정 라우트에 **`loading.tsx`** 누락 분을 채우고, **`--ds-*`** 와 정렬된 공통 로딩 UI를 둔다.  
3. **`FORENSIC-008`** — 관리자 대상 화면의 **`style={{ }}`** 를 **`admin-shared.module.css`** 로 이관한다.

## 관련 `tasks.md` ID

`DB-TODO-001`, `FORENSIC-007`, `FORENSIC-008` — 유형별 표(공통 DB 미구현/완료)·Phase 1·OPS 줄 반영.

## 수정 파일 목록 (주요)

- `docs/tasks.md`
- `src/app/globals.css` — `.loading-spinner` + `@keyframes`
- `src/components/route-loading/*` — 공통 `DefaultRouteLoading`
- `src/app/(app)/quotes|sales|sales/exec|sales/history|settings|settings/tags|rfq/loading.tsx` (각 `loading.tsx`)
- `src/app/(admin)/admin/dashboard|trades|participants|learning|engine|growth|settlements|policy/loading.tsx`
- `src/app/(admin)/admin-shared.module.css` — 신규 · 관리자 공통 레이아웃·테이블·모달·정책 행
- `(admin)/trades|learning|engine|growth|settlements|policy/page.tsx` — 모듈 스타일 적용
- `(admin)/participants/*`, `(admin)/participants/relationships/*` — 페이지 래퍼 + 클라이언트 모듈화
- `(admin)/policy/PolicyConsoleClient.tsx`, `(admin)/settlements/SettleOrderButton.tsx`

## 변경 내용 요약

- **DB**: 사용자 확인 내용(컬럼·tenant RLS) 반영해 `DB-TODO-001` **운영 종결**; 문구 역사와 migration 참조 유지.
- **Loading**: 요청 경로 전부 동일 패턴 `loading.tsx` → 공통 컴포넌트 re-export; 스피너는 전역 클래스로 DS 색 사용.
- **Admin 스타일**: 지정 관리자 화면에서 인라인 객체 스타일 제거; 동적 값만 **`--progress-p`** / **`--bar-h`** CSS 변수로 최소 유지.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit`: 통과.  
- `npm run build`: 통과.

## 남은 위험

- `/admin/dashboard`·`overview`·`tenants`·`layout.tsx` 등 **본 라운드 비대상** 경로에는 **`style={{ }}`** 가 남아 있음 — 차기 FORENSIC 또는 관리자 전역 레이아웃 페이즈에서 정리 가능.

## 다음 권장 작업

- 관리자 **레이아웃·대시보드·테넌트**까지 동일 `admin-shared` 패턴 확장.  
- 남은 **`FORENSIC-001`~006·009`** 순차 구현 시 PRODUCT §10·§6·원장 SSOT 문서와 재정합.
