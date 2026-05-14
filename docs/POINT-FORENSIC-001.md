# POINT-FORENSIC-001 — 적립금(포인트) 잔고 무결성

> **범위**: `realmyos` 공급자 CRM 주문 경로(`orders`·`order_lines`·`createOrder`·원장 조회).  
> **금지 준수**: 코드·migration·DB·포인트 실행 변경 없음. **운영 DB 직접 조회 없음.**

---

## SECTION 1 — 포인트 관련 테이블 현황

### 1.1 `docs/CONTEXT.md` 운영 테이블 인벤토리 (2026-05-14 SSOT 스냅샷)

다음과 같은 이름의 테이블은 **인벤토리 한 줄에 포함되지 않음**:  
`points`, `point_transactions`, `customer_points`, `rewards`, `loyalty` (및 `balance` 전용 테이블).

인벤토리에 나열된 75개 테이블 목록은 `docs/CONTEXT.md` **[ARCH-03] 운영 DB 테이블 전체** 단락(약 89행)을 참고.

### 1.2 `realmyos/supabase/migrations/*.sql` (저장소 incremental DDL)

- 문자열 `point` / `loyalty` / `reward`(테이블·컬럼 정의 맥락)에 대한 **일치 0건**(워크스페이스 grep 기준).
- 즉, **이 저장소에 포함된 incremental migration 파일만** 보면 `point_*` 전용 테이블을 **추가·정의하는 SQL은 없음**.
- `orders.point_used` 컬럼 자체는 CONTEXT의 `orders` 절(약 1021행)에 **정수 컬럼으로 기술**되어 있으나, 해당 컬럼을 **최초 생성하는 migration은 본 repo incremental 목록에서 추적되지 않음**(baseline/외부 DDL 가능성 — **추정 없이** “본 migrations grep에 없음”만 기록).

### 1.3 `src/` 코드

| 패턴 | 결과 |
|------|------|
| `point_used` | `order.ts`, `OrderCreateForm.tsx`, `ledger.ts`(주석), `ledger-calc.ts`(주석), `types/order.ts` |
| `point_transactions` / `customer_points` / `loyalty` / `rewards` (테이블 API) | **미사용**(해당 식별자로 `src` 검색 시 주문 적립금과 무관한 매치만 가능) |

**구분 요약**

| 구분 | 포인트 전용 테이블 | `orders.point_used` |
|------|-------------------|----------------------|
| CONTEXT 인벤토리 | **없음** | `orders` 테이블에 포함 |
| incremental migration 본문 | **없음** | 컬럼 생성 DDL **미추적** |
| 앱 코드 | **참조 없음** | **읽기/쓰기 있음** |

---

## SECTION 2 — `orders.point_used` 실제 흐름

### 2.1 입력 출처

- **UI**: `OrderCreateForm.tsx` — 사용자 입력 `pointNum`을 `createOrder({ ..., point_used: pointNum })` 로 전달.
- **클라이언트 검증**: `isNaN`·할인 후 잔액 초과·`finalAmount` 음수·`finalAmount === totals.total - discountNum - pointNum` 불일치 시 제출 차단.

### 2.2 서버 (`createOrder`)

```203:217:C:/Users/babok/Desktop/realmyos/src/actions/order.ts
  const discount_raw = Number(input.discount_amount ?? 0)
  const point_raw    = Number(input.point_used      ?? 0)

  if (isNaN(discount_raw) || isNaN(point_raw)) {
    return { success: false, error: '할인/적립금 값이 올바르지 않습니다.' }
  }

  const discount_amount = Math.max(0, Math.round(discount_raw))
  const point_used      = Math.max(0, Math.round(point_raw))

  if (discount_amount > totals.total_amount) {
    return { success: false, error: `기간할인(${discount_amount})이 주문금액(${totals.total_amount})을 초과합니다.` }
  }
  if (point_used > totals.total_amount - discount_amount) {
    return { success: false, error: `적립금(${point_used})이 할인 후 잔액(${totals.total_amount - discount_amount})을 초과합니다.` }
  }
```

- **음수 방어**: `Math.max(0, …)`.
- **총액 초과 방어**: `point_used > total_amount - discount_amount` 거부.
- **저장**: `orders` insert 시 `discount_amount`, `point_used` 컬럼에 함께 기록; `final_amount`는 insert 후 **select로 반환**(주석상 DB generated / 앱에서 insert 금지).

### 2.3 주문 수정 경로

- `updateOrder` 및 `OrderEditForm`에서 **`point_used` / `discount_amount`를 변경하는 코드는 검색되지 않음** — 생성 시에만 헤더 할인·적립 필드가 설정되는 구조로 보임.

---

## SECTION 3 — 잔고 차감 구조 판정 (CASE)

### 판정: **CASE C (단순 할인값 입력; 잔고 개념 없음)** + **CASE D의 일부(원장은 `final_amount`로 반영)**

| 기준 | 사실 |
|------|------|
| 잔고 테이블 갱신 | `createOrder` 성공 경로에서 **`customers`·별도 포인트 테이블을 차감하는 insert/update 없음** |
| Rollback | 주문 라인 insert 실패 시 주문 row를 `cancelled`로 보정하는 분기는 있으나, **포인트 잔고 복구는 해당 없음**(잔고 자체 없음) |
| 취소 | `cancel_order_and_void_allocations` — **할당 void + status cancelled**만; **`point_used` 환급·역분개 없음** (`supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`) |
| 결제 취소·refund | 본 턴에서 별도 “포인트 환급” RPC는 **검색되지 않음**; `point_used`는 주문 스냅샷 필드로만 존재 |

**CASE A/B 부정**: 실제 잔고를 보관·차감하는 테이블·트랜잭션 로그가 **앱+migration incremental 기준으로 존재하지 않음**. (B: “테이블만 있고 미연결”도 해당 없음)

---

## SECTION 4 — 중복 사용 가능성 평가

**전제**: 시스템이 추적하는 “포인트 잔고”가 없으므로, 전통적 의미의 **동일 잔고 이중 차감**은 DB에서 검증되지 않는다.

| 시나리오 | 코드 동작 | 위험 성격 |
|----------|-----------|-----------|
| 동일 사용자가 브라우저 탭 두 개에서 각각 `point_used=10,000` 주문 2건을 **연속 제출** | 각 `createOrder`는 **해당 주문의** `total_amount`·할인 대비 상한만 검사 | **외부 잔고를 전제로 하면** “실제로는 한도 초과인데 시스템은 허용” — **운영 정책 이중 적용** 위험 |
| 동시에 두 요청이 같은 순간에 들어옴 | **포인트 잔고 row에 대한 `SELECT … FOR UPDATE` 등 없음** | 잔고가 없어 DB race는 “잔고 차감” 관점에서 **해당 없음**; 대신 **주문 번호·라인** 쪽은 별도 원자성 주제 |
| 클라이언트만 조작 | Server Action에서 **재검증** | **클라이언트만**으로는 상한 초과 `point_used` 삽입 **불가**(서버에서 동일 상한 검사) |

**정리**: “중복 사용”은 **잔고 DB 관점에서는 정의 불가**이고, **운영자가 말하는 적립금 한도**를 시스템이 강제하지 않는다는 의미에서 **이중 혜택 가능성**은 남는다.

---

## SECTION 5 — 회계·원장 연결 여부

### 5.1 `final_amount` · 미수 계산

- `ledger-calc.ts` — `effectiveOrderAmount`는 **`final_amount` 우선**, 없으면 `total_amount`.

```9:14:C:/Users/babok/Desktop/realmyos/src/lib/ledger-calc.ts
export function effectiveOrderAmount(order: {
  final_amount?: number | null
  total_amount:  number
}): number {
  return order.final_amount ?? order.total_amount
}
```

- `ledger.ts` — 확정 주문 합산 시 `effectiveOrderAmount` 사용; 주석으로 **`final_amount = total - discount - point`** 관계를 명시.

```677:680:C:/Users/babok/Desktop/realmyos/src/actions/ledger.ts
  // final_amount = total_amount - discount_amount - point_used (DB에서 직접 가져옴)
  const orderFinalMap = new Map<string, number>()
  for (const o of orderRows ?? []) {
    orderFinalMap.set(o.customer_id, (orderFinalMap.get(o.customer_id) ?? 0) + effectiveOrderAmount(o as any))
```

- **결론**: `point_used`는 **라인 단위 세금 재계산이 아니라**, DB가 유지하는 **`final_amount`를 통해** 미수·매출 합산에 **간접 반영**된다( `discount_amount`와 동일하게 헤더 조정값).

### 5.2 `discount_amount` vs `point_used`

- 둘 다 **주문 헤더**에서만 적용; 라인 `supply_price`/`vat_amount`는 **라인 합계 기준**으로 이미 확정된 뒤 헤더에서 차감 — **세금 분개와 헤더 할인/적립의 정합**은 별도 회계 정책 이슈(본 문서는 코드 사실만: **동일 패턴의 두 숫자 필드**).

### 5.3 `payments` / 수금액

- `OrderCreateForm`에서 `finalAmount`(할인·적립 반영 후) 대비 수금액 상한을 UI에서 검사; `createPayment`는 **금액·고객·주문 연결**을 처리하되, **포인트 잔고와는 무관**.

### 5.4 취소 시 `customer_stats` RPC (주의)

- `cancelOrder`는 `update_customer_stats`에 **`-(order.total_amount)`** 를 전달한다.

```496:501:C:/Users/babok/Desktop/realmyos/src/actions/order.ts
  await supabase.rpc('update_customer_stats', {
    p_tenant_id:         ctx.tenant_id,
    p_customer_id:       order.customer_id,
    p_balance_delta:     -(order.total_amount),
    p_sales_delta:       -(order.total_amount),
```

- 주문에 `point_used`·할인이 있으면 **`total_amount`(라인 합)** 과 **`final_amount`(실청구)** 불일치 가능 — **취소 시 stats 조정이 gross 기준**이면 원장·UI stats와 **어긋날 여지**(이미 파일 내 주석으로 `customer_stats`는 deprecated 방향). **포인트 전용이 아닌 광범위 이슈**로 기록.

---

## SECTION 6 — 운영 위험도 TOP 10

1. **HIGH** — **실제 포인트 잔고 없음**: 외부 장부와 UI 숫자가 **영구 분리**될 수 있음.  
2. **HIGH** — **취소 시 `point_used` 자동 환급 없음**: 운영 수동 조정 전제.  
3. **HIGH** — **취소 RPC가 `point_used`를 언급하지 않음** — 회계 정책 “취소=혜택 환급”과 불일치 가능.  
4. **MID** — **이중 혜택(운영 정의)**: 시스템이 “가용 적립금”을 모름 → 탭·순차 주문으로 **동일 정책 한도 초과** 가능.  
5. **MID** — **`customer_stats` 취소 시 `total_amount` 기준** — `final_amount`·할인/적립과 **불일치** 가능.  
6. **MID** — **용어 리스크**: UI 「적립금」vs 실제 **숫자 필드**만 존재 → 교육·감사 착오.  
7. **MID** — **라인 세금 vs 헤더 차감**: 회계팀이 기대하는 부가세 표지와 다를 수 있음.  
8. **LOW** — **Race로 인한 이중 DB 차감**: 잔고 row가 없어 **전통적 의미의 race 없음**.  
9. **LOW** — **음수 `point_used`**: 서버·클라이언트에서 **차단**.  
10. **LOW** — **단일 주문 내 초과 입력**: 서버에서 **총액 대비 상한** 검증.

---

## SECTION 7 — MVP 구조 판정

### 판정: **A (임시 MVP 구조)** + **C (부분 구현)**

| 코드 | 근거 |
|------|------|
| **A** | 주문 헤더에 숫자 필드 + 검증만 있고, **적립·차감·원장 분개용 포인트 서브시스템 없음**. |
| **C** | **`final_amount`·원장 `effectiveOrderAmount`** 를 통한 **청구액 반영은 구현**되어 있어, “회계 숫자”와 “로열티 엔진”이 **분리된 부분 구현**. |
| **B (장기 운영 단일 구조)** | **부정** — 잔고·감사 추적·환급 자동화가 코드에 없음. |

---

## 참조 파일

`src/actions/order.ts`, `src/components/order/OrderCreateForm.tsx`, `src/lib/ledger-calc.ts`, `src/actions/ledger.ts`, `src/types/order.ts`, `supabase/migrations/20260507111000_create_cancel_order_and_void_allocations.sql`, `docs/CONTEXT.md` (테이블 인벤토리·`orders` 컬럼 서술)
