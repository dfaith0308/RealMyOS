# 2026-05-07 — SUP-MISSING-012 견적서 PDF/JPG 출력 구현

## 작업 목적

- PRODUCT §6-5 견적관리의 “견적 전달 기능(MVP)” 중
  - PDF 다운로드
  - JPG 다운로드
  를 구현한다.
- 다운로드 시 `quote_logs`에 이력(action=exported, detail=pdf/jpg)을 남긴다.

## 관련 작업 ID

- `SUP-MISSING-012`

## 변경 파일

- `src/actions/quote-export.ts`
- `src/components/quote/QuoteExportButton.tsx`
- `src/app/(app)/orders/quotes/QuoteDetailClient.tsx`
- `docs/tasks.md`

## 구현 내용 요약

### 1) Export 데이터 조회 액션

- `getQuoteForExport(quote_id)`
  - quotes + quote_items + customers + settings 조회
  - PDF 생성에 필요한 단일 payload로 정리해서 반환

### 2) PDF/JPG 다운로드 버튼

- `QuoteExportButton`
  - PDF: `@react-pdf/renderer`로 A4 견적서 PDF 생성 후 다운로드
  - JPG: 생성된 PDF 1페이지를 `pdfjs-dist`로 렌더링 → JPG로 변환 후 다운로드

### 3) 전송 이력(다운로드) 기록

- `logQuoteExport(quote_id, detail)`
  - `quote_logs`에 `action='exported'`, `after_data={detail:'pdf'|'jpg'}` 기록

### 4) 진입점 연결

- 견적 상세 화면(`QuoteDetailClient`) 상단 액션 영역에
  - [PDF 다운로드]
  - [JPG 다운로드]
  버튼을 추가했다.

## migration 여부

- 없음 (라이브러리/렌더링 구현)

## 테스트

- `npx tsc --noEmit` 통과

## 남은 위험 / TODO

- “전표/도장 설정”의 구체 settings key가 표준화되어 있지 않아, 로고/도장/사업자정보는 여러 key 후보를 best-effort로 매핑했다. 키 표준 확정 시 매핑을 정리해야 한다.
- “견적 전송 → 공유 방식 선택(카카오/문자/링크)” UX는 PRODUCT 정의상 필요하나, 이번 범위에서는 다운로드만 구현했다.

## 다음 권장 작업

- 카카오/문자 공유 링크 생성 및 “전송 UX: 견적 전송 버튼→공유 방식 선택” 플로우 구현
- 전표/도장 설정 UI에서 사용하는 settings key를 표준화하고 export 매핑 고정

