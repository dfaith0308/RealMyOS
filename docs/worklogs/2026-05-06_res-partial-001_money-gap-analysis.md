# RES-PARTIAL-001 — 돈관리(§8-5) 3화면 GAP 분석 및 세부 항목 분해

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

`resturant_os`의 돈관리 UI가 PRODUCT.md §8-5에서 정의한 “지급 예정 / 거래처 미지급금 / 자금 흐름” 3화면 구조와 얼마나 일치하는지 점검하고, 확정된 방향(단일 payments + pending/confirmed)을 기준으로 Phase 5에서 실행 가능한 단위로 작업을 분해한다.

## 관련 tasks.md ID

- RES-PARTIAL-001
- (참고) SUP-PARTIAL-004 — payments.status 용어 통일 맥락
- (참고) DB-DANGER-002 — `resturant_os/supabase/schema.sql`은 레거시 스냅샷

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_res-partial-001_money-gap-analysis.md`

## 변경 내용 요약

- PRODUCT.md §8-5의 3화면 스펙(컬럼/정렬/필터/행동)을 기준으로 현행 구현을 점검했다.
- 확정 결정 사항을 문서에 고정했다.
  - 데이터 모델: `payments` 단일 테이블 + `direction='outbound'`
  - 상태값: `pending` / `confirmed` 체계 통일
  - `payments_outgoing` 타입/테이블은 레거시로 취급 (즉시 제거·마이그레이션은 하지 않음)
- Phase 5에서 바로 착수 가능한 단위로 A~F 세부 항목을 분해해 `tasks.md`에 등록했다.

## 3화면 대조표 (요약)

### 1) 지급 예정 (핵심 실행 화면)

- **PRODUCT 요구**
  - 컬럼: 거래처명 / 금액 / due_date / 상태(planned/paid)
  - 정렬: due_date 오름차순
  - 필터: 3일 이내 / 이번 주 / 이번 달
  - 행동: [지금 처리하기]
- **현재 구현(관찰)**
  - 지급 예정 목록 + KPI + 수동 추가 + 지급 완료 버튼은 존재
  - 필터 UI는 없음
  - 상태/필드명이 `pending/confirmed` 및 `counterparty_name` 체계와 타입/UI가 혼재되어 정합성 이슈가 있음
- **판정**: 부분 충족 → (A, B, “지급 완료 트랜잭션/멱등성” 추가 분해 필요 가능)

### 2) 거래처 미지급금 (관계 관리)

- **PRODUCT 요구**
  - 컬럼: 거래처명 / 총 미지급금 / 가장 오래된 미지급일
  - 행동: 클릭 → 거래처 상세 지급 내역(드릴다운)
- **현재 구현(관찰)**
  - 거래처별 집계 목록과 드릴다운 UI 모두 없음
- **판정**: 미구현 → (C, D)

### 3) 자금 흐름 (판단 보조, MVP)

- **PRODUCT 요구(MVP)**
  - 이번 주 나갈 돈 / 이번 달 나갈 돈
  - 잔액 없이 “나갈 돈” 중심 표현
- **현재 구현(관찰)**
  - 이번 주/이번 달 KPI 및 요약 블록이 존재
  - 문구/표현은 PRODUCT 예시 문구와 1:1 정렬되어 있지 않음
- **판정**: 부분 충족 → (E)

## migration 여부

- 없음 (문서 작업만)

## 테스트 결과

- 미실행 — 문서 변경만 수행

## 남은 위험

- `resturant_os` 내부에서 `payments` 단일 테이블을 이미 참조하고 있으나, `supabase/schema.sql`에 `payments_outgoing`이 남아 있어 “정본 오인” 위험이 재발할 수 있음. (F로 레거시 주석 처리 필요)
- 타입(`PaymentOutgoing`) / UI(`MoneyClient`) / 액션(`actions/money.ts`) 간 필드명(`supplier_name` vs `counterparty_name`)과 상태값(`planned/paid` vs `pending/confirmed`) 혼재가 있어, UI가 정상 동작하더라도 데이터 표기가 틀릴 수 있음. (A 선결)
- “지급 완료”가 현재는 단일 update + UI 로컬 숨김 처리로 보이는 구조라, 멱등성/중복 클릭 방지/이벤트 전파(공급자OS 수금 이벤트)까지는 아직 PRODUCT 요구 수준을 충족하지 못할 가능성이 있음. (후속 분해 필요)

## 다음 권장 작업

- `RES-PARTIAL-001-A`를 최우선으로 처리해 타입/필드/상태를 단일화한 뒤,
  `RES-PARTIAL-001-B`(필터) → `RES-PARTIAL-001-C/D`(거래처 미지급금 화면) → `RES-PARTIAL-001-E`(문구) 순으로 진행한다.
- `RES-PARTIAL-001-F`로 `schema.sql`의 `payments_outgoing`이 “레거시 스냅샷”임을 명확히 남겨, 향후 스키마 오인으로 인한 회귀를 방지한다.

