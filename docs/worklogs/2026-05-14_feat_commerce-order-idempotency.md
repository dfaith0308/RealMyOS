| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

식당OS `createCommerceOrder`에서 더블클릭·네트워크 재전송·느린 응답 재시도 시 **동일 제출당 주문 1건**만 DB에 남기도록 서버 멱등성을 둔다. 클라이언트 `disabled`만으로는 보장하지 않는다.

## 관련 `tasks.md` ID

- `COMMERCE-001` (DDL·인덱스)
- `COMMERCE-005` (식당OS `/buy` 주문 생성)

## 수정 파일 목록

**`realmyos`**

- `supabase/migrations/20260514200000_commerce_orders_idempotency.sql` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-14_feat_commerce-order-idempotency.md` (본 파일)

**`resturant_os`**

- `src/actions/buy.ts`
- `src/lib/buy-types.ts`
- `src/components/buy/BuyCheckoutClient.tsx`

## 변경 내용 요약

- `commerce_orders`에 `checkout_submission_id`(클라이언트 제출당 UUID)·`idempotency_key`(tenant·user·장바구니 라인·배송·결제·제출 UUID 기반 SHA256 hex) 추가, `(tenant_id, checkout_submission_id)`·`(tenant_id, idempotency_key)` 부분 유니크 인덱스.
- `createCommerceOrder`: 제출 UUID로 기존 주문 선조회 → 있으면 **새 INSERT 없이** 동일 성공 페이로드 반환; 없으면 장바구니 검증 후 INSERT, PostgreSQL 유니크 위반(`23505`) 시 기존 주문 재조회 후 반환.
- 중복 재사용 시 서버 `console.info('[commerce_order_duplicate_reused]', JSON)` — `admin_logs`는 RLS상 식당 세션에서 삽입 불가하여 미연동(한계로 기록).
- 체크아웃: `useRef` + `crypto.randomUUID()`로 제출당 ID 고정, 성공 시에만 ref 초기화.

## migration 여부

- **파일 추가**: `20260514200000_commerce_orders_idempotency.sql` — **운영 DB 적용은 배포 시 별도 실행**(본 로그 시점 미실행).

## 테스트 결과

- `resturant_os`: `npx tsc --noEmit` 통과.
- `npm run lint`: `resturant_os`는 ESLint 미설정으로 대화형 프롬프트만 발생, 미실행.

## 남은 위험

- **DB에 migration 미적용 시** insert가 신규 컬럼 때문에 실패할 수 있음 — 앱 배포 전 migration 적용 필수.
- 동일 제출 UUID를 알면 타인이 해당 주문 요약을 받을 수 있는 이론적 위험(실무상 UUID 추측 불가에 가깝).

## 다음 권장 작업

- 운영 DB에 migration 적용 후 스모크(연타·재시도) 검증.
- 플랫폼 감사가 필요하면 `admin_logs`용 서비스 롤 API 또는 트리거 설계를 별도 검토.
