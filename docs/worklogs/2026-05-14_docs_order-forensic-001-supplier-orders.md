# ORDER-FORENSIC-001 — 공급자 주문 포렌식 문서화

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 1. 작업 목적

`realmyos` 공급자 테넌트의 **주문등록·수금동시처리·`point_used`/할인·거래처 연결·주문 수정 잠금**을 코드·기존 문서(`PRODUCT.md`, `tasks.md`의 `DB-CHECK-001` 등)만으로 정리하고, `commerce_orders` 경로와 구분한다. **코드·migration·DB 데이터 변경 없음.**

## 2. 관련 `tasks.md` ID

- `ORDER-FORENSIC-001` (신규 블록)
- 참조 인용: `DB-CHECK-001` (`create_payment_atomic`), `COMMERCE`/storefront 문서와의 경계

## 3. 수정 파일 목록

- `docs/ORDER-FORENSIC-001.md` (신규)
- `docs/tasks.md` (문서 사용법 항목 11, `[ORDER-FORENSIC-001]` 블록, OPS 작업 이력)
- `docs/worklogs/2026-05-14_docs_order-forensic-001-supplier-orders.md` (본 파일)

## 4. 변경 내용 요약

- SECTION 1–8 형식으로 주문 생성 액션·UI 수금 순서·`point_used` 처리·`order_edit_lock_days`(기본 7)·RFQ draft RPC의 `orders` insert 차이·취소 RPC 범위·50일 변경의 코드 연쇄 유무·고아 주문 SQL 예시(미실행)를 기록.
- `rules.md` / `DECISIONS.md` 에서 주문 수정 키워드 **미발견**(grep) 명시.

## 5. migration 여부

없음.

## 6. 테스트 결과

- 문서·grep·파일 열람만 수행. 운영 DB SELECT **미실행**. `tsc` 미실행.

## 7. 남은 위험

- 고아 `orders` 건수·기간 분포는 **DB 조회 전제**에서만 확정 가능.
- `create_payment_atomic` 본문은 저장소 migrations에 없음 — 잔액 상한 등 세부 규칙은 **운영 DDL** 대조 필요.

## 8. 다음 권장 작업

- 읽기 전용 SQL로 `customer_id` / `buyer_tenant_id` NULL 분포·기간 집계.
- RFQ RPC migration **Draft** 여부와 실제 배포 상태를 환경별로 확인.
