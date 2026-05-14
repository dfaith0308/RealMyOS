# TEST-RUN-MASTER-001

이 문서는 정무님이 실제 운영 흐름을 검증하기 위한 **실행 가이드**입니다.

위에서 아래 순서대로 진행하면:

- storefront 주문
- 입금 확인
- ERP receivable(`payments`) 생성
- allocation 생성
- supplier payable 생성
- pricing engine 적용(선택 시 주문 전에 정책 등록)
- 주문 취소 흐름

까지 **한 줄기**로 점검할 수 있습니다.

개발자용 SQL·forensic·엣지 케이스 문서는 **`docs/TEST-DEV/`** 를 참고합니다.

---

## 사전 준비

### 접속 주소(팀 배포 기준으로 메모)

| 구분 | 확인할 것 |
|------|------------|
| **관리자OS** | 배포된 `realmyos` 사이트 주소(예: `…/admin` 으로 들어가는 베이스 URL) |
| **식당OS(storefront)** | 배포된 `resturant_os` 사이트 주소에서 **`/buy`** 로 쇼핑몰 진입 |

### 계정

| 구분 | 확인할 것 |
|------|------------|
| **관리자 계정** | 관리자OS에 로그인 가능한 계정(역할: 관리자) |
| **식당 테스트 계정** | 식당OS에 로그인 가능한 계정(테넌트·주문 권한) |

### Supabase SQL Editor

- 프로젝트 대시보드 → **SQL** → **New query**
- 이 런북에서 SQL은 **필수가 아닌 확인용**입니다. SQL 없이 화면만으로도 대부분의 PASS를 판단할 수 있습니다.

### migration 적용 여부

- 주문 품목에 **가격 스냅샷**이 필요하면 `pricing_policies` 관련 migration이 적용되어 있어야 합니다.
- 배포 담당에게 **최신 `supabase/migrations` 적용 여부**를 한 번 확인해 두면 안전합니다.

### 추천 순서

1. storefront 기본 주문 흐름  
2. ERP 흐름(입금 → allocation → payable)  
3. pricing engine 확인(선택)  
4. 취소·한계 확인  

---

## STEP 1 — 무통장 계좌 설정

**어디**: 관리자OS → **`/admin/commerce/storefront-bank`**

**할 것**

- 은행명 입력  
- 계좌번호 입력  
- 예금주 입력  
- **저장** 클릭  

**확인**

- 저장 완료 안내(토스트 등)가 뜨는지  
- 이후 식당OS 주문 화면에서 **입금 계좌 안내**가 보이는지(STEP 4에서 확인)

---

## STEP 2 — 상품 공개 확인

**어디**: 관리자OS → **`/admin/commerce/products`**

**할 것**

- 목록에서 상품 **1개 이상**이 **판매 가능(visible 등)** 상태인지 확인  
- 없으면 상품을 등록한 뒤 **공개** 처리  

**확인**

- 식당OS → **`/buy`** 에서 해당 상품이 **목록에 보이는지**

---

## STEP 3 — 가격 정책 등록(선택)

**어디**: 관리자OS → **`/admin/commerce/pricing`**

**할 것**

- 정책 등록  
  - 이름: `테스트 10% 할인`  
  - 유형: **퍼센트 할인** (`percent_discount`)  
  - 값: `10`  
  - **전체 적용** 체크  
  - 등록 후 목록에서 **활성(active)** 인지 확인  

**확인**

- 정책 목록에 표시되는지  
- **가격 정책을 쓰지 않을 경우** 이 STEP은 건너뛰고 STEP 4에서 **정가**로 주문하면 됩니다.

---

## STEP 4 — storefront 주문 생성

**어디**: 식당OS → **`/buy`**

**할 것**

- 상품 선택 → **장바구니**  
- 체크아웃 진행  
- 결제 수단: **무통장입금**  
- **주문 완료**까지 진행  

**확인**

- 주문번호가 표시되는지  
- 무통장 **계좌 정보**가 표시되는지  
- STEP 3을 했다면 **할인 반영 금액**이 기대와 비슷한지(대략 10% 할인)

**주의**

- **주문번호**를 메모해 둡니다. 이후 관리자 화면에서 같은 건을 찾을 때 씁니다.

---

## STEP 5 — 중복 주문 방지 확인

**할 것**

- **같은 체크아웃**에서 결제·주문 완료 버튼을 **빠르게 두 번** 눌러 봅니다(의도적).  
  (환경에 따라 “이미 처리됨” 메시지가 나올 수 있습니다.)

**확인**

- 관리자OS → **`/admin/commerce/orders`** 에 **동일 주문이 1건만** 있는지  
- 주문이 **2건으로 늘지 않는지**

---

## STEP 6 — 입금 확인 처리

**어디**: 관리자OS → **`/admin/commerce/orders`**

**할 것**

- STEP 4에서 메모한 **주문**을 찾습니다.  
- **입금 확인 완료**(또는 동일 의미의 버튼)를 눌러 주문을 **결제 완료(`paid`)** 로 올립니다.

**확인**

- 주문 상태가 기대대로 바뀌는지  
- 아래 SQL로 **수금 원장**이 생겼는지 확인할 수 있습니다(선택).

**SQL 확인(선택)**

```sql
SELECT
  amount,
  direction,
  status,
  commerce_order_id
FROM payments
WHERE commerce_order_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 3;
```

**PASS 조건**

- `direction` = **inbound**  
- `status` = **confirmed**  
- `commerce_order_id` 에 값이 있음  

---

## STEP 7 — allocation 확인

**어디**: 관리자OS → **`/admin/commerce/allocations`**

**확인**

- 방금 `paid` 처리한 주문과 연결된 **allocation** 행이 생겼는지  
- **공급자명**·**품목 금액(item_amount)**·**지급 예정 금액**이 화면에 보이는지  
- 상태가 **pending** 인지  

**SQL 확인(선택)**

```sql
SELECT
  supplier_tenant_id,
  item_amount,
  supplier_payable_amount,
  status
FROM commerce_order_allocations
ORDER BY created_at DESC
LIMIT 5;
```

**주의**

- 현재 allocation은 **고객 청구 단가(`unit_price`) 기준**입니다. **`supplier_basis` 는 아직 분리 전**입니다.

---

## STEP 8 — supplier payable 생성 확인

**어디**: 관리자OS → **`/admin/commerce/allocations`**

**할 것**

- 해당 allocation에 대해 **지급 예정 확정**(또는 동일 의미의 버튼)을 누릅니다.

**확인**

- 관리자OS → **`/admin/commerce/payables`** 로 이동  
- **지급 예정(payable)** 행이 생겼는지  
- 공급자별로 **미지급(unpaid)** 으로 보이는지  

**SQL 확인(선택)**

```sql
SELECT
  supplier_tenant_id,
  payable_amount,
  status
FROM supplier_payables
ORDER BY created_at DESC
LIMIT 5;
```

**PASS 조건**

- payable **행이 생김**  
- `status` = **unpaid** (또는 화면과 같은 의미)

---

## STEP 9 — export 확인

**어디**: 관리자OS → **`/admin/commerce/orders`**

**할 것**

- **CSV 다운로드**  
- **XLSX 다운로드**  

**확인**

- 파일이 열리는지  
- **한글이 깨지지 않는지**  
- 주문 내용(품목·금액)이 맞는지  

---

## STEP 10 — 상품 수정 확인

**어디**: 관리자OS → **`/admin/commerce/products`** → 상품 선택 → **수정(편집)** 화면

**할 것**

- 설명·이미지 등 **작은 수정** 후 **저장**  

**확인**

- 저장 후 식당OS **`/buy`** 에서 변경이 **반영**되는지  
- 편집 중 이탈 시 **저장 안 된 변경**을 묻는 창이 뜨는지(있다면 정상 동작으로 기록)

---

## STEP 11 — pricing snapshot 확인

**어디**: Supabase → **SQL Editor**

**SQL**

```sql
SELECT
  listing_title,
  base_price,
  unit_price,
  applied_policy_id,
  applied_policy_snapshot
FROM commerce_order_items
ORDER BY created_at DESC
LIMIT 5;
```

**PASS 조건**

- `base_price` 가 **원래 상품 가격**과 맞는지  
- 정책을 썼다면 `unit_price` 가 할인 후 금액인지  
- 정책을 썼다면 `applied_policy_snapshot` 이 **비어 있지 않은지**  
- **주문 후** 관리자에서 정책 숫자를 바꿔도, **이미 찍힌 주문 행의 스냅샷·단가는 변하지 않아야** 합니다(불변 스냅샷).

---

## STEP 12 — 주문 취소 테스트

**어디**: 관리자OS → **`/admin/commerce/orders`**

**할 것**

- 테스트 주문을 **취소** 처리합니다.

**확인**

- **pending** 상태의 allocation 이 취소 처리되는지(화면 또는 아래 SQL)

**SQL(선택)**

```sql
SELECT
  status,
  cancelled_at
FROM commerce_order_allocations
ORDER BY created_at DESC
LIMIT 5;
```

**주의**

- 이미 **확정(confirmed)** 된 allocation·payable 은 **자동으로 원상복구되지 않을 수 있습니다.**  
- 환불·정산 **자동화는 없습니다** — 현재 제품 한계입니다.

---

## STEP 13 — 모바일 확인

**할 것**

- 휴대폰 브라우저로 식당OS **`/buy`** 접속  

**확인**

- 화면이 깨지지 않는지  
- 버튼을 **손가락으로 누를 수 있는지**  
- **주문 완료**까지 할 수 있는지  

---

## STEP 14 — 최종 운영 흐름 점검

**최종 확인(체크)**

- storefront 주문이 생성되었는지  
- 입금 확인 후 **payments** 가 생겼는지  
- **allocation** 이 생겼는지  
- 확정 후 **supplier payable** 이 생겼는지  
- (선택) **pricing 스냅샷**이 품목에 남았는지  
- **export** 가 열리는지  
- **취소** 시 pending allocation 이 막히는지  

**현재 limitation(반드시 숙지)**

- **환불 자동화** 없음  
- **rollback 자동화** 없음  
- **정산(settlement) 자동화** 없음  
- **`supplier_basis` 분리** 없음(금액은 고객 청구 축 중심)  
- **공급자 실지급(payout)** 없음  

---

## 더 깊게 볼 때

- 단계별 **SQL·PASS/FAIL·RLS** 상세: [`docs/TEST-DEV/TEST-RUN-001.md`](../TEST-DEV/TEST-RUN-001.md), [`docs/TEST-DEV/TEST-RUN-ERP-001.md`](../TEST-DEV/TEST-RUN-ERP-001.md), [`docs/TEST-DEV/TEST-RUN-PRICING-001.md`](../TEST-DEV/TEST-RUN-PRICING-001.md)  
- 개발자 체크리스트 전체: [`docs/TEST.md`](../TEST.md)

---

## 결과 기록 템플릿

```md
실행일:
실행자:

STEP 1: PASS / FAIL
STEP 2: PASS / FAIL
STEP 3: PASS / FAIL
STEP 4: PASS / FAIL
STEP 5: PASS / FAIL
STEP 6: PASS / FAIL
STEP 7: PASS / FAIL
STEP 8: PASS / FAIL
STEP 9: PASS / FAIL
STEP 10: PASS / FAIL
STEP 11: PASS / FAIL
STEP 12: PASS / FAIL
STEP 13: PASS / FAIL
STEP 14: PASS / FAIL

발견 문제:

비고:
```
