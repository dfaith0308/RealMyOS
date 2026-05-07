# Phase 7 — 연체 시스템 설계 (SUP-DANGER-003 + SUP-PARTIAL-005)

> 범위: **설계 문서만** (코드/마이그레이션/DB 적용 없음)  
> 전제(확인된 사실): `orders.due_date` 없음, `orders.payment_terms_days` 없음, `payments.due_date` 존재

---

## 1. 연체 정의

### 1.1 용어

- **due_date**: 주문(매출채권) 기준 **지급기한**(date)
- **grace_days**: 지급기한 경과 후에도 연체로 분류하지 않는 **유예기간**(일)
- **today**: 연체 판단 기준일(런타임에서 “현재 날짜”, 기본 UTC 기준 권장)

### 1.2 연체 판정 규칙 (MVP)

- 연체 여부는 **주문 단위**로 판단한다.
- 연체 판정 기준은 `due_date`이며, 유예기간(`grace_days`)을 고려한다.
- **연체 주문 조건**:

\[
\text{due\_date} + \text{grace\_days} < \text{today}
\]

- `grace_days`는 **settings에서 관리**한다.
  - 예: `settings.grace_days = 3`

### 1.3 promised_date (약속일) 처리

- Phase 7 설계 기준에서 “연체 판정”의 1차 기준은 `due_date`로 통일한다.
- `promised_date`는 후속 확장(예: 고객과 재약정한 기한)으로 두되,
  - 스키마에 존재하지 않거나 운영 정의가 불명확하면 Phase 7 1차 구현에는 **필수로 포함하지 않는다**.

---

## 2. 필요한 DB 변경 (계획)

> 본 문서에서는 **DDL을 작성하거나 적용하지 않는다.**  
> 단, Phase 7 구현을 위해 필요한 컬럼/설정의 형태만 명시한다.

### 2.1 `orders` 컬럼 추가

- `orders.due_date` (date) — **추가 필요**
- `orders.payment_terms_days` (integer) — **추가 필요**

### 2.2 due_date 계산 규칙

- 기본 계산:

\[
\text{due\_date} = \text{order\_date} + \text{payment\_terms\_days}
\]

- `payment_terms_days`의 기본값은 `settings.default_payment_terms_days`에서 가져온다.
  - 예: `settings.default_payment_terms_days = 30`

### 2.3 settings 추가/확장

- `settings.default_payment_terms_days` — **추가/운영값 확정 필요**
- `settings.grace_days` — **추가/운영값 확정 필요**

---

## 3. 연체 계산 (RULE-02 준수: 런타임 계산, DB 저장 금지)

### 3.1 핵심 원칙

- 연체금(Overdue)은 “총 미수금”과 동일하지 않다.
- 연체금은 **미수금 중에서 연체 조건을 만족하는 부분만** 합산해야 한다.
- 연체금/거래상태 등 파생 값은 **DB에 저장하지 않는다**(RULE-02).

### 3.2 계산식 (요구사항 그대로)

- 주문별 미수 잔액:

\[
\text{outstanding} = \text{final\_amount} - \text{collected\_amount}
\]

- 연체 합계:

\[
\text{overdue} = \sum \text{outstanding}
\quad \text{for confirmed orders where}\quad
\text{due\_date} + \text{grace\_days} < \text{today}
\]

### 3.3 collected_amount의 SSOT (collection_allocations)

- `collected_amount`는 **수금 배분(`collection_allocations`) 합**을 기준으로 계산한다.
  - void 처리된 배분은 제외: `status = 'active'`만 포함
- Phase 6에서 도입된 FIFO 자동 배분(`allocate_payment_fifo`)을 활용하되,
  - 배분 데이터가 없는 주문은 `collected_amount = 0`으로 취급(초기 데이터 소급 없음 원칙과 일치)

---

## 4. 주문상태 이중 구조 (SUP-PARTIAL-005)

> 목적: “운영 흐름”과 “원장/채권 상태”를 분리해 혼용을 막는다.

### 4.1 order_status (운영 상태)

- 운영 상태는 주문 처리/물류 중심의 단계로 관리한다.
- 최소 상태 집합(MVP):
  - `draft`
  - `confirmed`
  - `cancelled`
  - `delivered`

### 4.2 trade_status (원장 상태)

- 거래(채권) 상태는 “지급/수금 관점”에서 런타임으로 계산한다.
- 최소 상태 집합(MVP):
  - `unpaid`
  - `partial`
  - `paid`
  - `overdue`

### 4.3 trade_status 런타임 계산 규칙

입력:
- 주문: `final_amount`, `status(confirmed/cancelled 등)`, `due_date`
- 수금 배분: `collection_allocations(status='active')` 합
- 유예: `settings.grace_days`

규칙(권장):
- `cancelled` 주문은 trade_status 계산 대상에서 제외(미수/연체 집계 0으로 취급)
- `outstanding = final_amount - collected_amount`
  - `outstanding <= 0` → `paid`
  - `0 < outstanding < final_amount` → `partial`
  - `outstanding == final_amount` → `unpaid`
- 위 조건과 별개로 연체 조건을 만족하면:
  - `outstanding > 0` AND `due_date + grace_days < today` → `overdue`

---

## 5. 구현 순서 (Phase 7 실행 계획)

1. `orders`에 `due_date` + `payment_terms_days` 추가
2. `settings`에 `default_payment_terms_days` 추가
3. `getAccountsReceivable`에 “연체 분리” 로직 추가
4. 대시보드 연체 KPI 정확도 개선 (연체금/연체 거래처 수 등)
5. 수금 우선순위 점수/정렬을 `due_date` 기반으로 교체

---

## 6. migration 목록 (예정)

> 본 문서에서는 SQL 파일 생성/적용을 하지 않음 (계획만 기록).

- `orders.due_date`, `orders.payment_terms_days` 컬럼 추가
- `settings` seed:
  - `default_payment_terms_days = 30`
  - `grace_days = 3`

