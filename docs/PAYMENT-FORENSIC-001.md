# PAYMENT-FORENSIC-001 — storefront 결제 구조 포렌식

> **범위**: 저장소에 존재하는 **코드·의존성·예시 env**만 근거로 기술한다.  
> **저장소**: 주문·체크아웃은 **`resturant_os`**, 관리자 주문 UI·액션은 **`realmyos`**. (동일 모노레포 작업 시 경로 혼동 주의.)

---

## SECTION 1 — 현재 결제 방식 요약 (코드 기준)

```text
무통장입금 (bank_transfer):
- 주문·품목 행 생성 가능 (createCommerceOrder)
- commerce_orders: status='pending_payment', payment_status='unpaid', payment_method='bank_transfer'
- 식당 체크아웃 완료 화면: 입금 안내 문구만, 실제 계좌번호/예금주 없음 ("계좌 정보는 추후 운영자 설정" 문구)
- 관리자: "입금 확인 완료"로 pending_payment → paid 수동 전환 가능

카드결제 (card):
- createCommerceOrder는 payment_method='card'를 허용하나,
- BuyCheckoutClient에서 카드 선택 시 submit 자체가 막히고 에러 메시지 표시 (라디오 disabled)
- TossPayments 등 PG SDK/패키지 없음 (package.json, 소스 grep 기준)
- PG 승인·webhook·paymentKey 검증 흐름 없음

카카오 주문전달 (kakao_manual):
- bank_transfer와 동일하게 주문 생성 후 kakao_summary 문자열 생성
- 클라이언트에서 kakaotalk://send?text=… 로 열기 + 실패 시 클립보드 복사 (카카오 비즈니스 API 아님)
- 관리자: "카카오 확인 완료"로 pending_payment → paid 수동 전환 가능

장바구니 전용 "카카오 전달" 버튼:
- BuyCartClient 등 장바구니 전용 카카오 버튼 없음 (검색 기준)

payments / ledger (storefront 주문 경로):
- createCommerceOrder 및 updateCommerceOrderStatus 경로에서 payments 테이블·ledger 갱신 코드 없음 (realmyos commerce.ts grep 기준)
```

**문서 SSOT와의 차이**: `docs/commerce/COMMERCE-FLOW.md` 는 카드에 대해 `pending_payment → paid (PG 콜백 자동)` 및 `pending_payment` 24시간 초과 자동 `cancelled` 를 서술한다. **현행 코드에는 PG·자동 취소 구현이 없다** (본 문서 §운영 리스크 참고).

---

## SECTION 2 — storefront 주문 flow (실제 순서)

**식당 계정 로그인 상태**에서:

```text
/buy 목록·상세에서 장바구니 담기 (addToCart 등, buy.ts)
→ /buy/cart
→ /buy/checkout (BuyCheckoutClient)
→ 결제 방식 선택 (무통장 또는 카카오 주문전달; 카드는 UI만 비활성 + submit 시 차단)
→ "주문 완료" 클릭 → createCommerceOrder 서버 액션
→ Supabase: commerce_orders insert (status=pending_payment, payment_status=unpaid, payment_method=선택값)
→ commerce_order_items insert (실패 시 commerce_orders 해당 행 delete)
→ cart_items tenant 단위 delete (실패해도 주문은 이미 성공 처리됨 — console.error만)
→ 클라이언트: 완료 화면 + kakao_summary 있으면 shareTextViaKakao 호출
```

**외부 PG·입금 검증 단계는 없음** — 주문 row는 **결제 성공 전에** 생성된다.

---

## SECTION 3 — TossPayments 연동 상태

| Level | 정의 | 현재 |
|-------|------|------|
| LEVEL 0 | 구조 없음 | **해당**: `resturant_os`·`realmyos` `package.json`에 `@tosspayments/*` 없음. 소스에 `tosspayments` / `paymentKey` / `successUrl` 결제용 없음 (`failUrl`은 **로그인 콜백** `auth/callback/route.ts`에만 존재). |
| LEVEL 1 | UI/ENV만 | **부분**: 체크아웃에 "카드결제 — 준비 중" 라디오(비활성) + `payment` 쿼리 필터에 `card` 라벨은 있으나 실주문 불가. Toss 전용 env 키는 `.env.example`에도 없음 (`realmyos` 예시는 `NEXT_PUBLIC_STOREFRONT_ORIGIN`만). |
| LEVEL 2 | SDK 연결 | **없음** |
| LEVEL 3 | 실제 승인 flow | **없음** |
| LEVEL 4 | webhook / payments / ledger 연결 | **없음** |

**판정**: **LEVEL 0** (PG 연동 구조 없음). 체크아웃의 카드 UI는 **주문 불가 상태의 표시 수준**이다.

---

## SECTION 4 — 카카오 전달 구조 상태

| Level | 정의 | 현재 |
|-------|------|------|
| LEVEL 0 | 구조 없음 | 아님 — 문자열 생성·클라이언트 전달 경로 있음 |
| LEVEL 1 | 버튼/UI만 | 아님 — 주문 후 동작이 코드에 있음 |
| LEVEL 2 | 공유 기능 | **해당**: `shareTextViaKakao` → `kakaotalk://send?text=…` + `navigator.clipboard` 폴백 (`resturant_os/src/lib/kakao-share.ts`). 서버의 카카오 API 호출 없음. |
| LEVEL 3 | 실제 API 전달 | **없음** (카카오 비즈 메시지 API·액세스 토큰 흐름 없음) |
| LEVEL 4 | 주문 상태/payment 자동 연동 | **없음** — 전달 여부와 무관하게 `payment_status`는 `unpaid` 유지, 관리자 수동 `paid` 전환 |

**판정**: **LEVEL 2** (단말 공유/딥링크 + 클립보드). 카카오톡 앱 미설치·PC 환경에서는 동작이 제한될 수 있음.

---

## SECTION 5 — 주문 생성과 결제의 관계

- **시점**: `createCommerceOrder` 가 **한 번에** 주문·품목을 쓴다. **선결제 PG 단계 없음** → **결제 전 주문 생성**이 현재 유일 경로다.
- **기본값** (`buy.ts` insert): `status: 'pending_payment'`, `payment_status: 'unpaid'`.
- **롤백**: `commerce_order_items` insert 실패 시에만 **같 트랜잭션 내 `commerce_orders` delete** 후 에러 반환. "결제 실패" 롤백은 해당 없음(결제 단계 없음).
- **장바구니 삭제 실패**: 주문·품목 insert 이후 `cart_items` delete 실패 시 **주문은 유지**, `console.error`만 (`buy.ts`).
- **`payments` 테이블**: 본 주문 플로우 코드에서 **참조·insert 없음** (`realmyos/src/actions/admin/commerce.ts` 주문 관련 구간 기준).
- **ledger**: `updateCommerceOrderStatus` 등 커머스 주문 액션에서 **ledger 갱신 없음** (동 파일 `payments`/`ledger` 문자열 grep 없음).

---

## SECTION 6 — 운영 리스크

- **실계좌 미노출**: 무통장 선택 시에도 **계좌번호·은행·예금주**가 UI에 없어 식당이 입금할 수 없다(문구만 존재).
- **결제 없이 주문 확정**: DB에 `pending_payment` 주문이 생기며, **외부 입금/PG 검증 없음**.
- **`payment_status`**: 생성 시 `unpaid`. 관리자가 `paid`로 **주문 status**를 바꿀 때 `payment_status`를 `paid`로 패치한다(`updateCommerceOrderStatus`). **입금 사실의 시스템 검증은 없고** 관리자 클릭에 전적으로 의존.
- **PG 성공 검증 없음**: 카드 경로 자체가 주문까지 도달하지 못함.
- **카카오 전달 추적 없음**: 딥링크/클립보드 성공 여부가 **주문·결제 상태와 연결되지 않음**.
- **문서·코드 불일치**: `COMMERCE-FLOW.md` 의 카드 자동 `paid`·24시간 자동 `cancelled` 는 **앱 코드에서 확인되지 않음** — 운영 기대치 착오 위험.
- **필터**: 관리자 주문 목록에 `card` 결제 필터는 있으나, **실제 카드 주문 데이터는 생성 경로가 없음** (필터만 존재).

---

## SECTION 7 — TossPayments 도입 시 필요한 최소 작업 (현 구조 기준, 설계 힌트만)

본 절은 **구현 지시가 아니라**, 현재 `commerce_orders`·`updateCommerceOrderStatus`·체크아웃 구조를 전제로 한 **빈틈 목록**이다.

### 반드시 필요한 것 (카드 “실결제”를 쓰려면)

- 주문 생성 **이전** 또는 **직후**에 PG가 요구하는 **서버 검증** 경로(승인 결과를 신뢰할 수 있는 주체는 서버).
- 승인 결과와 **동일 주문 row**를 매칭할 식별자 저장 컬럼 또는 테이블(현 스키마에는 PG 키 필드 없음 — migration은 별 ID·승인 절차).
- `paid` / `payment_status` 를 **PG 검증 성공 후에만** 설정하는 분기(현재는 관리자 수동 `paid`만 존재).

### 있으면 좋은 것

- Webhook + 멱등 처리(이미 `checkout_submission_id`/`idempotency_key` 패턴이 주문 생성에 있음).
- `admin_logs`에 결제 이벤트 기록(현재는 주문 상태 변경 로그 중심).

### 지금 하면 안 되는 것 (본 문서 범위)

- 본 파일만 보고 **추측으로 PG 벤더·SDK 버전을 고정**하거나, 저장소에 코드·migration을 **이번 턴에서** 추가하는 것 — 사용자 지시(`PAYMENT-FORENSIC-001`)는 **조사만** 해당.

---

## 조사 시 열람한 파일·경로 (참고)

| 경로 | 내용 |
|------|------|
| `resturant_os/src/components/buy/BuyCheckoutClient.tsx` | 결제 UI, 카드 차단, 완료 화면, `shareTextViaKakao` |
| `resturant_os/src/actions/buy.ts` | `createCommerceOrder`, insert 필드, 카트 삭제 |
| `resturant_os/src/lib/kakao-share.ts` | `kakaotalk://send?text=` |
| `resturant_os/src/lib/kakao-format.ts` | `buildKakaoOrderSummary` 문자열 |
| `resturant_os/package.json` | 의존성 (Toss 없음) |
| `resturant_os/.env.development.example` | Supabase·tenant만, 결제 키 없음 |
| `realmyos/src/components/commerce/OrdersClient.tsx` | 결제대기 큐, 입금/카카오 확인 버튼, 필터, export |
| `realmyos/src/actions/admin/commerce.ts` | `getCommerceOrders`, `updateCommerceOrderStatus` |
| `realmyos/package.json` | 의존성 (Toss 없음) |
| `realmyos/.env.example` | `NEXT_PUBLIC_STOREFRONT_ORIGIN`만 |
| `docs/commerce/COMMERCE-FLOW.md` | 문서상 카드·timeout 정책 |

---

## 기록 템플릿 (감사 결과 남길 때)

```text
PAYMENT-FORENSIC-001 확인일:
확인자:
환경 (dev/staging/prod):

무통장: PASS / FAIL (근거: 화면에 계좌 노출 여부)
카드: LEVEL 0~4 중:
카카오: LEVEL 0~4 중:

COMMERCE-FLOW.md와 코드 불일치 인지: Y/N

비고:
```
