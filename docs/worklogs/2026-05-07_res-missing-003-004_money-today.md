# 2026-05-07 — RES-MISSING-003/004 식당OS 돈관리 분리 + 오늘운영 카드

## 작업 목적

- PRODUCT §8-4 돈관리의 3메뉴 구조를 식당OS에 반영한다.
- PRODUCT §8-3 오늘운영의 카드 생성 로직을 “최대 3개” 원칙으로 구현한다.
- 자동 실행/자동 발송은 하지 않고(CTA는 페이지 이동만), 사용자가 수동으로 정리/실행한다.

## 관련 작업 ID

- `RES-MISSING-003`
- `RES-MISSING-004`

## 변경 범위(저장소)

- `resturant_os` (식당OS)
- `realmyos` 문서(`docs/tasks.md`, `docs/DECISIONS.md`, 본 worklog)

## 구현 내용 요약

### 1) 돈관리 3메뉴 분리 (RES-MISSING-003)

- `/money` → `/money/upcoming` 자동 리다이렉트
- 3개 하위 화면 분리:
  - `/money/upcoming`  (지급예정)
  - `/money/suppliers` (거래처미지급금)
  - `/money/cashflow`  (자금흐름)
- 기존 `getMoneyDashboard` / 기존 데이터 구조는 유지하고, 화면에 맞게 노출만 분리
- 돈관리 화면 상단에 3메뉴 서브 네비 추가

### 2) 오늘운영 카드 생성 로직 (RES-MISSING-004)

- 카드 최대 3개(초과 금지)
- 우선순위: 돈흐름 > 절약기회 > 오늘할일
- 1순위 돈흐름 카드:
  - 조건: due_date - today ≤ 3일(= payment_due_3days > 0) 또는 “타이트” 상태
  - CTA: `/money/upcoming`
- 2순위 절약기회 카드:
  - 조건: 가격 하락/상승 기준(5%/10%) 충족 시
  - CTA: `/rfq/new`
- 3순위 오늘할일 카드:
  - 조건: 미처리 발주요청(open_rfqs) 또는 납품 대기(pending_deliveries)
  - CTA: `/rfq`
- 카드 0개면:
  - "오늘도 잘 운영하고 계세요 👍"
  - CTA: `/rfq/new`

## migration 여부

- 없음 (UI 분리 + 카드 로직 구현)

## 테스트

- `resturant_os`: `npx tsc --noEmit` 통과

## 결정 기록

- `docs/DECISIONS.md`에 `[D-014] 식당OS 오늘운영 카드 최대 3개 원칙` 추가

## 남은 위험 / TODO

- PRODUCT의 “잔액 80%” 조건은 식당OS에서 잔액(계좌/현금) 데이터 모델이 확정되어야 100% 구현 가능하다. 현재는 돈관리 대시보드의 `is_tight`를 보조 신호로 사용한다.
- “카드 제거 조건(결제 처리/공급자 선택 완료 등)”을 이벤트 기반으로 완전 자동 제거하려면, 각 완료 이벤트와의 명확한 연결 규칙이 추가로 필요하다.

