# SUP-PARTIAL-001 — 대시보드(§6-1) 블록 매핑 점검 및 GAP 갱신

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT §6-1(대시보드)에서 정의한 블록 순서/데이터/UX를 기준으로, 현행 `realmyos` 대시보드 구현(`dashboard/page.tsx`)이 어떤 블록을 포함/누락하는지 점검하고 `tasks.md`의 `SUP-PARTIAL-001` GAP 설명을 최신 코드 기준으로 갱신한다.

## 관련 tasks.md ID

- SUP-PARTIAL-001

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-07_sup-partial-001_dashboard-gap-audit.md`

## 변경 내용 요약

- PRODUCT §6-1의 레이아웃 블록(오늘 행동/알림, 수금 TOP5, KPI, 오늘 할 일, 매출 TOP5, 자금 배치 제안)과 현행 구현을 1:1로 매핑했다.
- 현행 구현에 존재하는 섹션과 링크(오늘 수금할 거래처 박스, KPI 4종, TOP5 섹션, 자금 계획 요약 등)를 `tasks.md`에 기록했다.
- 누락/불일치 블록(블록1, TOP5 컬럼/강조, KPI 링크, RFQ 미응답, 상품 수량 컬럼, fund_rules 기반 자금 배치 제안)을 GAP로 명확히 정리했다.

## migration 여부

- 없음 (분석/문서화만)

## 테스트 결과

- 미실행 — 이유: 본 작업은 문서 갱신(점검/분해) 범위이며, 구현/수정은 다음 작업에서 수행

## 남은 위험

- TOP5 “지연일/우선순위 점수” 및 블록7 fund_rules 기반 분배는 DB/RPC/설정 모델 의존성이 커서, 구현 시 스키마/RLS/집계 기준(confirmed/delivered 등)을 먼저 확정해야 한다.
- 현재 상단이 AI 인사이트로 시작해 PRODUCT의 “오늘 행동/알림”과 우선순위가 충돌한다(UX 설계 결정 필요).

## 다음 권장 작업

- `SUP-PARTIAL-001-A`(블록1)부터 착수해 PRODUCT 우선순위(행동→돈 회수→KPI…) 순으로 레이아웃을 재정렬한다.
- TOP5 표/오늘 할 일/RFQ 연계를 구현하기 전, 필요한 데이터 소스(RFQ, promised_date/due_date, fund_rules)의 존재 여부를 `DB-*` 절차로 재확인한다.

