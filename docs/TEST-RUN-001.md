# TEST-RUN-001 — 운영 테스트 실행 가이드

> **성격**: QA 자동화·단위 테스트 문서가 **아님**. 정무님이 **실제 브라우저에서** 식당OS(`resturant_os`)와 관리자OS(`realmyos`)를 순서대로 눌러보며 이상을 발견·기록하기 위한 **실행 순서 가이드**다.  
> **전제**: 아래 경로·파일명·테이블명은 저장소 **현재 코드** 기준이다. 구현되지 않은 기능(예: 체크아웃의 **카드 결제** — UI에서 “준비 중”으로 막힘)은 **실행 대상에서 제외**한다.

**상위 체크리스트**: 항목 정의·감사 관점은 [`docs/TEST.md`](./TEST.md)를 본다. 본 문서는 그 항목을 **손으로 재현하는 순서**로만 풀었다. **STEP 8** = storefront→`payments` **ERP bridge** 검증, **STEP 9** = 테스트 데이터 정리.

---

## STEP 0 — 환경 / 연결 상태 확인

테스트를 시작하기 전에 **한 번에** 확인한다.

### 실행 순서

1. **관리자OS(`realmyos`)** 개발 또는 스테이징 URL에서 앱이 **정상 기동**하는지 확인한다 (빌드 오류 없이 페이지가 열림).
2. **식당OS(`resturant_os`)** URL에서 앱이 **정상 기동**하는지 확인한다.
3. **브라우저 프로필**을 나눈다: 관리자용 탭·식당용 탭(또는 시크릿 창)으로 **역할이 섞이지 않게** 한다.
4. **관리자 계정**으로 `realmyos`에 로그인해 `/admin` 계열 메뉴가 보이는지 확인한다.
5. **식당 테넌트 계정**으로 `resturant_os`에 로그인해 `/buy` 등 앱 라우트가 열리는지 확인한다.
6. **스토어 미리보기(iframe)** 를 쓰려면 `realmyos` 실행 환경에 **`NEXT_PUBLIC_STOREFRONT_ORIGIN`** 이 설정되어 있어야 한다. 값은 **슬래시 없이** 식당OS 베이스 URL(예: `http://localhost:3001`) 형태다. 코드: `realmyos/src/components/commerce/ListingsClient.tsx` 의 `getStorefrontOrigin()`.
7. **Supabase**: 두 앱 모두 동일 프로젝트(또는 팀이 정한 대상 DB)를 바라보는지, 로그인·목록 조회 시 **네트워크 오류가 없는지** 확인한다 (브라우저 개발자 도구 Network).
8. **Storage**: 상품 이미지 업로드는 관리자 액션 `uploadListingImage`가 버킷 **`commerce-images`** 에 업로드한다 (`realmyos/src/actions/admin/commerce.ts`). 업로드 1회로 실패 메시지가 없는지 확인한다.
9. **주문 멱등 DB**: 공통 DB에 마이그레이션 파일 `realmyos/supabase/migrations/20260514200000_commerce_orders_idempotency.sql` 내용이 적용되어 `commerce_orders`에 **`checkout_submission_id`**, **`idempotency_key`** 컬럼 및 부분 유니크 인덱스가 존재하는지 확인한다 (Supabase Table Editor 또는 SQL).
10. **스토어 미리보기 iframe**: 관리자 **상품 목록**에서 「스토어 미리보기」로 iframe이 뜨고, `NEXT_PUBLIC_STOREFRONT_ORIGIN` 이 있을 때 **`/buy/products/[id]`** 또는 **`/buy`** 가 iframe에 로드되는지 확인한다. 상품이 `status=visible` 이고 노출 ON이 아니면 iframe에 404가 뜰 수 있음 — 코드상 **구매자 화면과 동일**한 정책이다 (`ListingsClient.tsx` 안내 문구와 동일).

### PASS 기준

- 관리자·식당 **각각** 로그인된 상태에서 다음 화면까지 **에러 페이지 없이** 진입 가능하다:  
  - 관리자: `/admin/commerce/products`, `/admin/commerce/products/new`, `/admin/commerce/orders`  
  - 식당: `/buy`, `/buy/cart`, `/buy/checkout`
- iframe이 설정된 경우 **실제 식당OS `/buy` 라우트**를 로드한다(빈 화면·CORS 차단만 아니면 됨; 상품 미노출은 STEP 6과 별개로 정책에 따름).
- 썸네일·상품 이미지 URL이 **403/깨짐이 아닌지** 1건 이상 육안 확인(Storage 정책·공개 URL 문제 조기 발견).

### STEP 0 실패 시

**증상**: 앱 기동 실패, 로그인 불가, iframe 빈 화면·CORS, 이미지 업로드 즉시 실패.

**확인**

- `realmyos`·`resturant_os` 각각의 **환경 변수**(`NEXT_PUBLIC_*`, Supabase URL/Key).
- `NEXT_PUBLIC_STOREFRONT_ORIGIN` — 식당OS 실제 origin과 **일치**하는지(포트 포함).
- Supabase **Auth** 설정·RLS(로그인은 되는데 빈 데이터만 나오는 경우).
- Storage **`commerce-images`** 버킷 존재·정책.
- `information_schema.columns` / Table Editor로 **`commerce_orders.checkout_submission_id`**, **`idempotency_key`** 존재 여부.

**임시 대응**

- 환경 변수 수정 후 **프로세스 재시작**.
- iframe 없이도 식당OS를 **별 탭에서 동일 URL**로 열어 동일 정책인지 비교한다.

---

## STEP 1 — 관리자OS 상품 등록 확인

### 실행 순서

1. 브라우저에서 **`/admin/commerce/products/new`** 로 이동한다 (`realmyos/src/app/(admin)/admin/commerce/products/new/page.tsx` → `ListingNewClient`).
2. **상품명** 등 필수 항목을 입력한다(폼 검증 메시지가 나오면 그대로 수정).
3. **썸네일**을 업로드한다(클라이언트 → `uploadListingImage` → 버킷 `commerce-images`).
4. **공개 저장**: 화면의 「저장 후 공개」 등 **`status: 'visible'`** 로 저장되는 버튼으로 저장한다(코드상 `submitWithStatus('visible', false)` 계열).
5. **저장 완료** 토스트(성공 문구)를 확인한다.
6. **`/admin/commerce/products`** 목록으로 이동해 방금 상품이 보이는지 확인한다.
7. (선택) 목록에서 **「스토어 미리보기」** → iframe **상품 상세** 탭으로 실제 `/buy/products/[id]` 가 로드되는지 확인한다. 동시에 식당OS에서 동일 `id` URL을 열어 **화면을 비교**한다.

### PASS 기준

- 저장 직후 **목록에 행이 나타나고**, 새로고침 후에도 **동일 listing이 유지**된다.
- `commerce_product_listings`·연결된 `products` 행이 생겼는지 필요 시 DB에서 확인 가능(운영자 권한으로만).
- iframe을 쓰는 경우: **동일 listing id**에 대해 iframe과 식당OS 탭의 **노출 가능 여부가 정책상 일치**한다(둘 다 `visible`+노출 ON일 때만 상세가 열리는 등 — `resturant_os/src/actions/buy.ts` 의 `assertListingBuyable`: `status === 'visible'` 이고 `is_visible` 이 참이어야 함).

### STEP 1 실패 시

**증상**: 저장 실패 토스트, 썸네일 깨짐, 목록에 안 보임.

**확인**

- 브라우저 **Console**의 `console.error` (예: `[ListingNew] createListingFull failed`, 업로드 실패 로그).
- 서버 액션: `realmyos/src/actions/admin/commerce.ts` 의 **`createListingFull`**.
- Supabase 테이블: **`commerce_product_listings`**, **`products`** (에러 메시지에 FK·제약이 찍히는지).
- Storage: **`commerce-images`** 업로드 응답.

**임시 대응**

- 필수 필드·카테고리·가격 형식 재확인 후 재저장.
- 동일 증상이면 **관리자 주문 화면이 아닌** 상품 쪽만 집중해 DB·Storage 로그를 남긴다.

---

## STEP 2 — 식당OS storefront 주문

### 실행 순서

1. **식당 계정**으로 `resturant_os`에 로그인한 상태에서 **`/buy`** 로 이동한다 (`src/app/(app)/buy/page.tsx`).
2. 목록에서 **테스트 상품**(STEP 1에서 `visible`+노출된 상품)을 찾는다.
3. **`/buy/products/[id]`** 상세로 들어간다.
4. **장바구니 담기** 후 **`/buy/cart`** 에서 수량을 확인한다.
5. **`/buy/checkout`** 에서 배송 정보를 채운다.
6. 결제 방식은 **`무통장`** 또는 **`카카오 주문전달`** 만 선택한다 — **`카드`** 는 클라이언트에서 “준비 중”으로 처리되어 **이 가이드의 주문 성공 경로에 넣지 않는다** (`BuyCheckoutClient.tsx` 의 `payment === 'card'` 분기).
7. 주문 제출 후 화면에 **「주문이 접수됐습니다 ✓」** 및 주문번호 표시가 나오는지 확인한다 (`BuyCheckoutClient.tsx` 완료 UI).
8. 관리자OS **`/admin/commerce/orders`** 에서 동일 주문이 **목록에 보이는지** 확인한다 (`OrdersClient`가 받는 `orders` / `manualReviewQueue` 데이터).

### PASS 기준

- **`commerce_orders`에 1건** insert(및 **`commerce_order_items`** 행들) — 실패 시 Supabase에서 주문 id 기준으로 조회.
- 식당 화면에 **완료 카드**가 표시되고, 관리자 목록에서 **동일 건**을 찾을 수 있다.
- **Export 대상**: 주문 목록 페이지에 뜬 주문 id들이보내기 범위에 포함된다(`OrdersClient.tsx` 의 `exportOrderIds`: 현재 화면의 `manualReviewQueue` + `orders` 순서로 수집).

### STEP 2 실패 시

**증상**: 체크아웃에서 오류 메시지, 완료 화면 없음, 관리자에 주문 없음.

**확인**

- `resturant_os/src/actions/buy.ts` 의 **`createCommerceOrder`** (입력 검증·장바구니·`assertListingBuyable`).
- 테이블: **`commerce_orders`**, **`commerce_order_items`**, **`cart_items`** (주문 후 장바구니 비우기 실패는 콘솔 `console.error('[createCommerceOrder] cart clear failed', …)`).
- 브라우저 **Network** 탭에서 서버 액션 응답 본문.

**임시 대응**

- 관리자에서 **주문이 생겼는지 먼저** 본다(식당 UI만 실패인지 분리).
- 장바구니·배송 필드·결제 수단을 다시 확인한다.

---

## STEP 3 — 중복 주문 방지 테스트

코드 기준: `BuyCheckoutClient.tsx` 는 **마운트 이후 첫 제출 시** `crypto.randomUUID()` 로 `checkout_submission_id` 를 한 번 만들고, **성공 시에만** 그 ref를 `null`로 돌려 **같은 세션에서 재제출 시 새 UUID**가 나갈 수 있다. **연타 방지**는 서버의 **`checkout_submission_id` + DB 유니크** 및 **`tryReturnExistingCommerceOrderBySubmission`** 경로에 의존한다 (`buy.ts` 상단~`createCommerceOrder` 본문).

### 실행 순서

1. STEP 2와 동일하게 장바구니·체크아웃까지 진행한다(무통장 또는 카카오 주문전달).
2. 체크아웃에서 **「주문하기」 버튼을 짧은 시간에 여러 번** 눌러 본다(의도적 연타).
3. 같은 체크아웃 페이지에서 **새로고침 후** 다시 제출해 본다(이 경우 클라이언트가 **새 `checkout_submission_id`** 를 발급할 수 있어 **별 주문**이 생길 수 있음 — “한 화면에서의 연타”와 구분해 기록한다).
4. (선택) 개발자 도구 **Network throttling** 으로 느린 네트워크에서 제출·응답 지연 시 중복 생성 여부를 본다.

### PASS 기준

- **동일 `checkout_submission_id`** 로 재전송되는 요청에 대해 DB에 **주문이 1건만** 남는다(서버가 기존 주문을 반환하는 경로).
- 관리자OS 주문 목록에서 **의도하지 않은 복제 행**이 없다(연타 직후 row 수 확인).
- 장바구니가 비워졌는지 식당 측 `/buy/cart` 로 확인한다.

### STEP 3 실패 시

**증상**: 동일 제출에 주문이 2건 이상, 유니크 위반 오류 노출.

**확인**

- `commerce_orders` 의 **`checkout_submission_id`**, **`idempotency_key`** 값이 row마다 어떻게 찍혔는지.
- `20260514200000_commerce_orders_idempotency.sql` **적용 여부**(인덱스 존재).
- `resturant_os/src/actions/buy.ts` 내 **`tryReturnExistingCommerceOrderBySubmission`** 및 insert 직후 에러 처리.
- 브라우저 **Network** 에서 동일 payload 반복 여부.

**임시 대응**

- DB에 중복이 생겼으면 **운영 절차에 따라** 취소·환불 처리(본 가이드는 데이터 수정 절차를 정하지 않음).
- 마이그레이션 미적용이면 **배포 전 DB 적용**을 최우선으로 한다.

---

## STEP 4 — 관리자OS export 테스트

### 실행 순서

1. 관리자 **`/admin/commerce/orders`** 에서 필터를 조정해 **보낼 주문이 화면에 포함**되게 한다(export는 **현재 페이지에 로드된 주문 id 집합**을 사용한다 — `OrdersClient.tsx` 의 `exportOrderIds`).
2. **「CSV보내기」** 클릭 → 다운로드된 파일을 저장한다.
3. **「XLSX보내기」** 클릭 → 다운로드된 파일을 저장한다.
4. CSV는 **Excel·메모장**으로, xlsx는 **Excel**로 연다.
5. 열 순서·의미는 코드 상수 **`SUPPLIER_EXPORT_HEADERS`** 와 동일한지 본다:  
   `주문번호, 주문일시, 식당명, 받는사람, 연락처, 배송지, 상품명, 수량, 배송메시지, 결제상태`  
   (`realmyos/src/lib/commerce-order-supplier-export.ts`).

### PASS 기준

- CSV: **`UTF-8 BOM`** 이 붙어 한글이 깨지지 않는다(구현: `supplierExportRowsToCsvString` 의 `\uFEFF` 접두).
- xlsx: `xlsx` 라이브러리로 생성된 파일이 **Excel에서 정상 열림** (`OrdersClient.tsx` 의 동적 `import('xlsx')` 후 `XLSX.write`).
- **한 행 = 주문의 한 품목**(화면 안내: 「품목당 1행」).
- 식당명·주문일시·상품명·수량 등이 **공급자에게 그대로 전달 가능한 수준**인지 육안 판단한다.

### STEP 4 실패 시

**증상**: 다운로드 실패, 빈 파일, 한글 깨짐, 열 누락.

**확인**

- `realmyos/src/actions/admin/commerce.ts` 의 **`getCommerceOrderSupplierExportRows`** (서버에서 행 조립).
- `realmyos/src/lib/commerce-order-supplier-export.ts` — **CSV BOM**, `escapeCsvCell`, xlsx 시트명 `Sheet1`.
- `realmyos/src/components/commerce/OrdersClient.tsx` 의 **`runSupplierExport`** 분기.

**임시 대응**

- 화면에 주문이 0건이면 export 행도 0이다 — 필터를 푼다.
- CSV만 긴급 필요하면 xlsx는 보류하고 BOM 있는 CSV를 공급자에 전달한다.

---

## STEP 5 — 상품 quick edit 테스트

### 실행 순서

1. 관리자 **`/admin/commerce/products`** 에서 대상 행의 **「수정」** 링크를 누른다 → **`/admin/commerce/products/[id]/edit`** (`ListingEditClient`).
2. **상품명**을 구분 가능한 문자열로 바꾼다.
3. **저장**한다(폼 submit → `updateListingFull`).
4. 저장 성공 시 코드상 **`router.push('/admin/commerce/products')`** 로 목록에 돌아온다 (`ListingEditClient.tsx`).
5. 식당OS **`/buy`** 또는 상세 URL에서 **이름이 반영**되었는지 확인한다(캐시·재검증에 따라 새로고침이 필요할 수 있음 — `updateListingFull` 은 `revalidatePath('/admin/commerce/products')` 등 호출, `realmyos/src/actions/admin/commerce.ts`).
6. **변경 없이** 다시 edit에 들어가 **상품명만 수정**한 뒤, **저장하지 않고**:
   - **「목록으로」** 링크를 눌러 **`window.confirm('저장하지 않은 변경이 있습니다. 이동할까요?')`** 가 뜨는지 확인한다.
   - **취소** 동작도 동일 `confirmLeave` 를 사용한다.
7. **탭 닫기·다른 사이트로 이동·새로고침** 직전에, 변경이 있을 때 브라우저 기본 **나가기 방지**(beforeunload)가 걸리는지 확인한다 — 구현: `window.addEventListener('beforeunload', …)` (`ListingEditClient.tsx`). 브라우저마다 문구는 다르다.
8. (DB 권한이 있을 때) **`admin_logs`** 에 **`action_type: 'listing_updated'`** 레코드가 생겼는지 확인한다 (`updateListingFull` 내 insert).

### PASS 기준

- 저장 후 목록으로 돌아가고 **변경 필드가 반영**된다.
- dirty 상태에서 **「목록으로」·취소** 시 **confirm** 이 뜬다(위 문자열).
- beforeunload는 **dirty일 때만** 등록된다.
- `admin_logs`에 **listing_updated** 기록이 남는다(환경에서 조회 가능한 경우).

**한계(코드 기준, 중요)**

- **브라우저 뒤로가기 버튼** 전용攔截은 `ListingEditClient.tsx` 에 **`popstate` 처리 없음**. STEP 5에서 확인하는 “이탈 확인”은 **목록으로 링크·취소·beforeunload(탭 닫기/새로고침 등)** 에 한정한다.

### STEP 5 실패 시

**증상**: 저장 실패, 목록에 반영 없음, confirm 미표시, 로그 없음.

**확인**

- `realmyos/src/actions/admin/commerce.ts` 의 **`getListingForEdit`**, **`updateListingFull`**.
- **`admin_logs`** 테이블.
- `revalidatePath` 호출 여부(같은 파일 내 `updateListingFull` 끝단).
- 브라우저 Console 에 서버 액션 에러가 있는지.

**임시 대응**

- validation 메시지(판매가·정상가·카테고리 등)에 맞게 수정 후 재저장.
- 스토어 반영이 느리면 식당OS **강력 새로고침** 후 재확인.

---

## STEP 6 — hidden 상품 테스트

코드 기준: 스토어에서 담기·주문 가능 여부는 **`status === 'visible'` 이고 `is_visible === true`** (`assertListingBuyable`). 목록의 **「숨김」** 은 `updateListingStatus(..., 'hidden')` (`ListingsClient.tsx`).

### 실행 순서

1. 관리자 상품 목록에서 테스트 상품을 **`visible` 상태로 둔 채** 「**숨김**」 버튼을 눌러 `hidden`으로 바꾼다.
2. 식당OS **`/buy`** 및 해당 **`/buy/products/[id]`** 에서 **목록·상세에 나타나지 않거나 담기 불가**인지 확인한다(에러 메시지 또는 목록에서 소실).
3. 관리자에서 **「재공개」** 등으로 다시 **`visible`** 로 돌린다(`ListingsClient.tsx` 의 `visible` 전이 버튼).
4. 식당OS에서 **다시 노출·담기 가능**한지 확인한다.
5. **스토어 미리보기 iframe** 이 동작하는지(STEP 0과 동일 전제) 재확인한다.

### PASS 기준

- `hidden` 일 때 구매 플로우에서 **해당 상품을 살 수 없음**.
- 다시 `visible`(+노출 ON)이면 **스토어에 나타남**.
- iframe은 **정책 안내 문구**대로 동작한다(비노출이면 404 등).

### STEP 6 실패 시

**증상**: 숨겼는데도 스토어에 보임, 또는 반대.

**확인**

- 테이블 **`commerce_product_listings`** 의 **`status`**, **`is_visible`**, **`deleted_at`**.
- `resturant_os/src/actions/buy.ts` 의 listing 조회·**`assertListingBuyable`** 조건.
- 관리자에서 **edit 화면의 “스토어에 공개” 체크**와 목록 **상태 버튼**이 서로 어떤 필드를 바꾸는지 혼동 없이 기록한다.

**임시 대응**

- 의도한 필드만 바꿨는지 확인 후, 한 번 더 상태 전이를 반복해 본다.

---

## STEP 7 — 모바일 테스트

### 실행 순서

1. 브라우저 **디바이스 툴바**로 모바일 폭(예: iPhone 12 근처)을 연다 — 실기기가 있으면 **실기기**로 동일 순서를 밟는다.
2. 식당OS **`/buy`** 목록 스크롤·탭한다.
3. 상품 상세 → **장바구니** → **체크아웃**까지 터치로 진행한다(STEP 2와 동일하되 **터치** 중심).
4. 관리자OS **`/admin/commerce/orders`** 를 모바일 폭에서 연다(가로 스크롤·버튼 가림 여부).

### PASS 기준

- 주요 버튼이 **손가락으로 누를 수 있는 크기·간격**인지 육안으로 판단한다.
- **레이아웃 깨짐·가로 스크롤 이상**이 없다(심하면 [!]로 `docs/TEST.md`에 역추적).
- **주문 1건 완료**까지 도달 가능하다(결제는 STEP 2와 같이 무통장/카카오만).

### STEP 7 실패 시

**증상**: 버튼이 가려짐, fixed 요소에 가려 클릭 불가, 가로로 삐져나감.

**확인**

- 해당 페이지의 **레이아웃 CSS**(컴포넌트·글로벌 스타일) — 구체 파일은 페이지마다 다르므로 **개발자 도구 Elements**로 overflow·z-index·`position: fixed` 후보를 찍는다.
- 터치 타깃이 겹치는지.

**임시 대응**

- 가로 모드·다른 기기 폭으로 재시도해 **재현 조건**을 기록한다.

---

## STEP 8 — storefront → ERP payments bridge 검증

> **목적**: storefront 주문(`commerce_orders`)이 관리자 **입금 확인(paid)** 이후 **`payments` 원장**에 자동 기록되는지 검증한다.  
> **성격**: 단순 주문 UI 테스트가 아니라 **ERP 연결(P0)** 검증이다.  
> **코드 기준**: `realmyos/src/actions/admin/commerce.ts` — `updateCommerceOrderStatus` → `tryRecordPlatformReceivablePayment`; migration `realmyos/supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql`.

### 사전 조건

다음이 **모두** 갖춰졌는지 확인한다.

1. **운영(또는 스테이징) DB**에 migration **`20260515100000_add_commerce_order_id_to_payments.sql`** 적용 완료 — `payments.commerce_order_id` 컬럼·부분 UNIQUE·`chk_order_id_exclusive`·`payments_payment_method_check` 확장 포함 (Table Editor / `information_schema` / 아래 SELECT로 확인).
2. 관리자 **`/admin/commerce/storefront-bank`** 에 **무통장 계좌** 입력·저장 완료 (`getStorefrontBankTransferSettingsAdmin` / `updateStorefrontBankTransferSettings`, `storefront-bank-transfer.ts`).
3. 테스트용 상품이 **`visible`** 이고 스토어 노출 조건을 만족하는지 확인한다(STEP 1·STEP 6과 동일 정책).
4. **식당 테넌트 계정**으로 `resturant_os` 로그인 가능(STEP 0).

### 실행 순서

#### 1. 관리자OS 무통장 계좌 설정

1. 관리자OS에서 **`/admin/commerce/storefront-bank`** 로 이동한다 (`realmyos/src/app/(admin)/admin/commerce/storefront-bank/page.tsx`).
2. **은행명·계좌번호·예금주·안내 문구**를 입력하고 저장한다.
3. 저장 성공(오류 없음)·재방문 시 값이 유지되는지 확인한다.

#### 2. 식당 계정 storefront 주문

1. 식당 계정으로 **`/buy`** → 상품 선택 → **`/buy/cart`** → **`/buy/checkout`** (`resturant_os`).
2. 결제 수단은 **`무통장(bank_transfer)`** 을 선택한다(본 STEP의 PASS 조건이 `bank_transfer` 기준 — **카카오 주문전달**만 쓴 경우 PASS의 `payment_method` 기대값을 **`kakao_manual`** 로 바꿔 기록한다).
3. 주문 제출 후 **주문번호 표시·무통장 계좌 안내 노출**을 확인한다.
4. (선택) Supabase에서 해당 `commerce_orders` 행: **`payment_status = unpaid`**, **`status = pending_payment`** 인지 확인한다.

#### 3. 관리자OS 주문 paid 처리

1. 관리자 **`/admin/commerce/orders`** 로 이동한다 (`OrdersClient`).
2. 위에서 만든 주문에 대해 **「입금 확인 완료」**(또는 동일 의미의 `pending_payment` → **`paid`** 전이 버튼)를 실행한다 — 서버 액션 `updateCommerceOrderStatus` (`commerce.ts`).
3. 목록·상세에서 **`status`·`payment_status`(paid)** 반영을 확인한다.

#### 4. `payments` 테이블 검증

Supabase **SQL Editor**에서 아래를 실행한다.

```sql
SELECT
  id,
  commerce_order_id,
  amount,
  direction,
  status,
  payment_method,
  payment_date,
  payer_tenant_id,
  payee_tenant_id,
  tenant_id,
  created_at
FROM payments
WHERE commerce_order_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

### PASS 조건

아래를 **모두** 만족하면 PASS(무통장 시나리오 기준).

- **`payments` 행이 1건 이상** 생겼고, **`commerce_order_id`** 가 해당 `commerce_orders.id` 와 일치한다.
- **`amount`** = 해당 주문의 **`commerce_orders.total_amount`** 와 같다.
- **`direction`** = `inbound`.
- **`status`** = `confirmed`.
- **`payer_tenant_id`** = 해당 주문의 **`commerce_orders.tenant_id`**(식당 테넌트).
- **`payee_tenant_id`** = **`00000000-0000-0000-0000-000000000000`** (`PLATFORM_OWNER_TENANT`, `commerce.ts` 상수와 동일).
- **`tenant_id`** = **`00000000-0000-0000-0000-000000000000`**(코드상 플랫폼 소유 행과 동일).
- **`payment_method`** = `bank_transfer`(카카오 전용 테스트 시 `kakao_manual`).
- **`payment_date`** 가 NULL이 아니다(날짜 컬럼).

### FAIL 증상 및 확인 위치

**CASE 1 — `payments` 행이 없음**

- 확인: `realmyos/src/actions/admin/commerce.ts` — `updateCommerceOrderStatus`, `tryRecordPlatformReceivablePayment`(조건·에러 로그).
- 확인: migration 미적용·RLS로 insert 거절 여부.

**CASE 2 — `payment_method` CHECK 위반 등 스키마 오류**

- 확인: DB 제약 **`payments_payment_method_check`** 및 migration **`20260515100000_add_commerce_order_id_to_payments.sql`** 적용 여부.

**CASE 3 — 동일 주문에 `payments`가 2건 이상**

- 확인: 인덱스 **`payments_commerce_order_id_unique`** 존재 여부.
- 확인: 동일 **`commerce_order_id`** 중복 row.

**CASE 4 — 주문은 `paid` 인데 `payments` 없음(부분 성공)**

- 확인: **`admin_logs`** 에 **`action_type = platform_payment_insert_failed`** 가 있는지(`commerce.ts`).
- 확인: 서버/브라우저 **`console.error('[platform storefront payment]' …)`** 출력.

### 기록 템플릿

```text
STEP 8 — storefront → ERP bridge 검증

실행일:
실행자:

주문번호:

결과:
PASS / FAIL / PARTIAL

payments row 생성 여부:

발견 문제:

비고:
```

---

## STEP 9 — 테스트 데이터 정리

실제 DB를 쓰므로 **끝낼 때 반드시** 정리한다.

### 실행 순서

1. 테스트로 **숨김·품절·판매중단** 해 둔 상품이 있으면, 운영方針에 따라 **`visible` + 재공개** 또는 **discontinued 유지** 등 **남겨도 되는 상태**로 되돌린다.
2. 상품 **admin 메모** 등에 “테스트” 표식을 남겼는지 확인한다(신규 등록 폼·edit에 메모 필드 있음).
3. 테스트 **주문**이 있다면: 운영 정책상 취소·보존 여부를 정하고, **export로보낸 파일**을 로컬에서 삭제하거나 보관 위치를 통일한다.
4. **중복 주문**이 STEP 3에서 생겼는지 `commerce_orders` 로 확인하고, 불필요한 row가 있으면 **별도 운영 절차**로 처리한다(본 문서는 SQL 삭제를 지시하지 않음).
5. 장바구니에 **테스트 품목**이 남아 있으면 식당 화면에서 비운다.

### PASS 기준

- 운영 데이터와 **테스트 데이터를 식별**할 수 있다(메모·이름 규칙).
- `hidden` 등 **의도치 않은 비노출 상품을 방치**하지 않았다.

### STEP 9 실패 시

**증상**: 어떤 상품이 테스트인지 모름, 주문만 쌓임.

**확인**

- `commerce_product_listings` / `commerce_orders` **최근 생성분**을 시간·tenant로 필터.
- 관리자 UI **상품명·메모** 필드.

**임시 대응**

- 팀 내 **네이밍 규칙**(예: `[TEST]` 접두)을 정하고 다음 실행부터 적용한다.

---

## 비가역 원칙 검증 (기능 테스트가 아님)

`docs/TEST.md` **「4. [비가역 원칙]」** 과 동일한 관점이다. 아래는 **자동 판정이 아니라** 정무님이 **화면·보내기·대화 로그**를 근거로 YES/NO를 적는 항목이다.

### 검증 항목 (실행)

1. **storefront** 주문·장바구니·상품 UI에서 **공급자 식별·직접 연락처**가 구매자(식당)에게 **불필요하게 노출**되지 않는지 본다.
2. **RFQ** 흐름(식당·공급자 화면 각각)에서 **계약 전** 단계에 **식당명 등 직접 식별**이 공급자에게 보이지 않는지 본다 — 구체 화면 경로는 팀이 쓰는 빌드 기준으로 `resturant_os` RFQ 라우트를 연다.
3. 결제·주문 UI에 **플랫폼 외 결제**(개인 계좌 유도, 다른 PG 링크 등)가 없는지 본다.
4. **플랫폼 외 연락 유도**(카톡 ID, 개인 전화로만 주문하라는 문구 등)가 없는지 본다.
5. RFQ와 storefront 사이에서 **직거래·수수료 회피**가 문면·UX상 쉬운지 판단한다.

### PASS 기준

- 위 각 항목에 대해 **문제 없음**을 적을 **근거**(화면 이름·스크린샷·export 일부)를 남긴다.
- 하나라도 **의심**이면 `docs/TEST.md` 규칙대로 **`[!]`** 로 표시하고 이슈로 옮긴다.

### 비가역 섹션 실패 시

**증상**: 민감 정보 노출, 외부 결제 문구 발견.

**확인**

- 해당 문구가 있는 **컴포넌트 파일**·**액션 파일**(개발자 도구로는 문자열만으로도 검색 가능).
- **export** 파일(`SUPPLIER_EXPORT_HEADERS` 범위 밖의 열 추가 여부).

**임시 대응**

- **노출 중단**이 가능한 설정이 있으면 즉시 끄고, 없으면 **콘텐츠 제거**를 이슈로 올린다.

---

## 테스트 결과 기록 템플릿

각 STEP마다 복사해 사용한다.

```text
STEP N — [제목]

실행일:
실행자:
결과: PASS / FAIL / PARTIAL

발견 문제:

비고:
```

---

## 문서·코드 참조 (읽기 전용)

| 구분 | 경로 |
|------|------|
| 관리자 상품 신규 | `realmyos/src/app/(admin)/admin/commerce/products/new/page.tsx` |
| 관리자 상품 목록·iframe·상태 버튼 | `realmyos/src/components/commerce/ListingsClient.tsx` |
| 관리자 상품 수정 | `realmyos/src/components/commerce/ListingEditClient.tsx` |
| 관리자 주문·export UI | `realmyos/src/components/commerce/OrdersClient.tsx` |
| 주문 행 조립(서버) | `realmyos/src/actions/admin/commerce.ts` — `getCommerceOrderSupplierExportRows` |
| CSV·파일명·BOM | `realmyos/src/lib/commerce-order-supplier-export.ts` |
| 식당 체크아웃·주문 완료 UI | `resturant_os/src/components/buy/BuyCheckoutClient.tsx` |
| 주문 생성·멱등·장바구니 | `resturant_os/src/actions/buy.ts` — `createCommerceOrder` |
| 멱등 migration | `realmyos/supabase/migrations/20260514200000_commerce_orders_idempotency.sql` |
| storefront → `payments` P0 bridge | `realmyos/supabase/migrations/20260515100000_add_commerce_order_id_to_payments.sql` |
| 주문 `paid` 시 플랫폼 수금 row | `realmyos/src/actions/admin/commerce.ts` — `updateCommerceOrderStatus`, `tryRecordPlatformReceivablePayment` |
| 무통장 계좌 설정(관리자) | `realmyos/src/app/(admin)/admin/commerce/storefront-bank/page.tsx`, `realmyos/src/actions/admin/storefront-bank-transfer.ts` |
| 체크리스트 원문 | `docs/TEST.md` |
