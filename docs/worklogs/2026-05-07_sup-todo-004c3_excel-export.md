# SUP-TODO-004-C-3 — analytics 엑셀 출력

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`/analytics` 화면에서 분석 결과를 **엑셀(.xlsx)로 다운로드**할 수 있게 해, 외부 공유/가공(회계/영업 보고)을 가능하게 한다. 이번 범위는 엑셀만 포함하며 PDF/JPG는 제외한다.

## 관련 tasks.md ID

- `SUP-TODO-004-C-3`

## 수정 파일 목록

- `package.json` (dependency: `xlsx`)
- `src/lib/analytics-export.ts` (신규)
- `src/components/analytics/AnalyticsShell.tsx` (엑셀 다운로드 버튼)
- `docs/tasks.md`

## 변경 내용 요약

- `xlsx` 라이브러리를 도입했다.
- `AnalyticsShell` 상단(기간 필터 라인 우측)에 “엑셀 다운로드” 버튼을 추가했다.
- 버튼 클릭 시 현재 `tab/from/to` 기준으로 **Server Action 재조회** 후,
  - `overview`: `by_date` 1시트
  - `margin`: 상품별 rows 1시트
  - `customer`: 거래처별 rows 1시트
  - `risk`: 섹션별 5시트
  형태로 엑셀을 생성해 클라이언트에서 다운로드한다.
- 파일명 규칙: `analytics_<tab>_<from>_<to>.xlsx`

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` (pass)

## 남은 위험

- `xlsx` 번들 크기 증가 가능성(다운로드 버튼 클릭 시에만 사용되지만, 클라이언트 번들 영향은 추후 확인 필요).
- `risk` 탭 시트가 5개로 늘어나며, 데이터가 많아질 경우 생성 시간이 늘어날 수 있다.

## 다음 권장 작업

- PDF/JPG 출력은 별도 ID로 분리해 진행(렌더링/폰트/레이아웃 이슈가 큼).
- 엑셀 컬럼명을 사용자 친화 한글 헤더로 매핑하는 옵션(현행은 영문 키 기반)을 후속으로 고려.

