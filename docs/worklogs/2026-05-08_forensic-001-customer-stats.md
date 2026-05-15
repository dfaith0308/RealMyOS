| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

- 운영 검증에서 `customer_stats.current_balance`가 **원장(AR)과 전부 불일치**로 확인되었으므로, 코드에서 해당 값을 **사용하지 않도록 차단**한다.
- `customer_stats` 테이블은 유지하되(`total_sales`, `last_payment_date` 등), **미수/잔액 지표는 원장 기반 계산**만 사용한다.

## 검증 결과 (운영 DB)

- 표본 10개 거래처: **전부 불일치**
- 최대 차이: **1,535,800원**
- 결론: `customer_stats.current_balance`는 **신뢰 불가 → 사용 금지**

## 변경 내용

### 1) `customer_stats.current_balance` 사용처 확인 결과

`realmyos/src` 기준:

- `src/actions/ledger.ts` — `getCustomersWithStats()`에서 `customer_stats`를 조회하나,
  - `current_balance`는 **원장 기반 계산으로 덮어써서 사용 중**(실제 사용 없음)
  - 다만 SELECT 컬럼에 `current_balance`가 포함되어 있어 **오해/재사용 위험**이 존재

### 2) 조치

- `src/actions/ledger.ts`
  - `customer_stats` SELECT에서 `current_balance` 컬럼을 제거
  - 미수/잔액은 기존대로 `getAccountsReceivable()` 기반 계산만 사용
- `docs/FORENSIC.md` §6에 **불일치 검증 완료 및 사용 금지**를 명시

## 수정 파일

- `src/actions/ledger.ts`
- `docs/FORENSIC.md`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`: 통과

## 메모 / 후속

- 테이블/데이터 자체의 즉시 수정·DROP은 금지(데이터 손실 위험).  
- `customer_stats`의 다른 컬럼(`total_sales`, `last_payment_date`)의 신뢰성은 별도 검증 대상으로 유지.

