# DECISIONS.md — 식식이OS 핵심 결정 기록
> 왜 이렇게 결정했는가를 기록한다.
> AI가 같은 실수를 반복하지 않기 위한 문서다.
> 새로운 결정이 생기면 반드시 여기에 추가한다.

---

## [D-001] 멀티테넌트 구조 — tenant_id 기반 격리
- 결정일: 2026-04
- 결정: 모든 테이블에 tenant_id 필수
- 이유: 공급자OS / 식당OS / 관리자OS가
        단일 Supabase DB를 공유하기 때문
- 금지: tenant_id 없는 쿼리 절대 금지
- 금지: 클라이언트에서 다른 tenant 데이터 접근

---

## [D-002] 계산값 DB 저장 금지
- 결정일: 2026-04
- 결정: 미수금 / 마진율 / 잔액 등 계산값은
        DB에 저장하지 않고 실시간 계산
- 이유: 저장 시 데이터 불일치 발생 위험
        원본 데이터가 변하면 계산값이 틀어짐
- 금지: balance / margin_rate 컬럼에 계산값 저장
- 예외: 성능 문제 발생 시 캐싱 테이블 허용
        단 SSOT는 항상 원본 데이터

---

## [D-003] 과거 데이터 불변 원칙
- 결정일: 2026-04
- 결정: 주문 / 수금 / 매입가 등 과거 데이터 수정 금지
- 이유: 회계 정합성 / 감사 추적 / 신뢰성
- 구현:
  - order_lines: 주문 시점 스냅샷 복사 저장
  - product_costs: 매입가 이력 테이블로 관리
  - 수정 필요 시 새 레코드 생성 + 로그 기록
- 금지: UPDATE on orders / order_lines / payments

---

## [D-004] 물리 삭제 금지 (Soft Delete)
- 결정일: 2026-04
- 결정: 모든 데이터는 물리 삭제 금지
- 이유: 데이터 복구 가능성 / 이력 추적 / 감사
- 구현: is_active = false 또는 deleted_at 컬럼
- 금지: DELETE FROM 절대 금지
- 대상: 거래처 / 상품 / 분류 / 태그 등 모든 테이블

---

## [D-005] Server Action 전용 DB 접근
- 결정일: 2026-04
- 결정: 모든 Supabase 쿼리는 Server Action에서만
- 이유: 보안 / tenant_id 검증 강제 / RLS 우회 방지
- 금지: 클라이언트 컴포넌트에서 직접 Supabase 쿼리
- 금지: useEffect 안에서 supabase.from() 호출

---

## [D-006] Migration 파일 필수
- 결정일: 2026-05
- 결정: DB 스키마 변경은 반드시 migration 파일 먼저
- 이유: 변경 이력 추적 / 재현 가능성 / 배포 안정성
- 프로세스:
  1. Supabase에서 테이블 존재 여부 확인
  2. migration SQL 작성
  3. Supabase에서 실행
  4. 커서에게 "DB 적용 완료" 포함 코드 구현 지시
- 금지: migration 파일 없이 테이블 생성/수정

---

## [D-007] N+1 쿼리 금지
- 결정일: 2026-04
- 결정: 반복문 안에서 DB 쿼리 금지
- 이유: 성능 / 응답 속도
- 구현: JOIN 또는 IN 절로 한 번에 조회
- 금지: for문 안에서 supabase.from() 호출

---

## [D-008] 주문상태 이중 구조
- 결정일: 2026-05
- 결정: orders 테이블에 두 개의 상태 컬럼 분리
  - order_status: 운영 흐름
    (접수/확인/출고준비/출고완료/납품완료/취소)
  - status: 거래상태/원장
    (draft/confirmed/cancelled)
- 이유: 운영 처리와 회계 원장은 다른 목적
        섞으면 잔액 계산 오류 발생
- 금지: 두 상태 혼용 / 하나로 합치는 것

---

## [D-009] 분류 시스템 — customer_tag_options 기반
- 결정일: 2026-05
- 결정: 거래처 분류 카테고리와 옵션값을
        코드에 하드코딩하지 않고
        customer_tag_options 테이블에서 동적 관리
- 이유: 운영 중 카테고리/옵션 추가 필요
        코드 배포 없이 즉시 변경 가능해야 함
- 구현:
  - customer_tag_options: 카테고리+옵션 관리
  - customer_tags: 거래처별 선택된 분류
  - customer_tag_logs: 변경 이력
- 금지: 분류 옵션 코드 하드코딩

---

## [D-010] 예치금 = 부채 개념
- 결정일: 2026-05
- 결정: 수금 초과분은 예치금으로 처리
        예치금은 수익이 아니라 부채
- 이유: 회계 정합성
        고객에게 돌려줘야 할 금액
- 구현:
  - customer_deposits: 잔액 스냅샷
  - deposit_logs: 변경 이력 (credit/debit)
- 금지: 예치금을 매출로 계산하는 것

---

## [D-011] 분류 옵션 동적 관리 — customer_tag_options 기반
- 결정일: 2026-05
- 결정: 거래처 분류 카테고리와 옵션값을
        코드에 하드코딩하지 않는다
        customer_tag_options 테이블에서 동적으로 관리
- 이유: 운영 중 카테고리/옵션 추가 필요
        코드 배포 없이 즉시 변경 가능해야 함
        업종/유입경로 등은 비즈니스에 따라 계속 변함
- 구현:
  - customer_tag_options: 카테고리+옵션 관리
  - customer_tags: 거래처별 선택된 분류값
  - customer_tag_logs: 변경 이력
  - /settings/tags: 관리자 설정 화면
- 금지: 분류 카테고리/옵션 코드 하드코딩

---

## [D-012] 거래처 등록 폼 최소화 원칙
- 결정일: 2026-05
- 결정: 거래처 등록 폼에는 기본 필드만 입력
        분류 항목은 등록 폼에 넣지 않는다
- 이유: 등록 시 입력 부담 최소화 (5초 등록 원칙)
        분류는 거래하면서 점진적으로 추가하는 데이터
        등록 시 강제하면 이탈 발생
- 구현:
  - 등록 폼 필수: 상호명 또는 이름 + 연락처
  - 분류(고객유형/관리등급/유입경로 등):
    거래처 상세 페이지 분류 섹션에서 관리
- 금지: 등록 폼에 분류 select 필드 추가

---

## [D-013] 자동화영업 — 자동 발송 절대 금지
- 결정일: 2026-05
- 결정: 자동화영업은 추천과 스케줄 생성까지만
        실제 발송은 반드시 사람이 실행
- 이유: B2B는 관계 비즈니스
        자동 발송 과하면 관계가 깨진다
        사용자 승인 없는 발송 절대 금지
- 금지: 자동 무한 발송 / 사용자 승인 없는 발송

---

## [D-014] 식당OS 오늘운영 카드 최대 3개 원칙
- 결정일: 2026-05
- 결정: 오늘운영 화면에 카드는 최대 3개만 표시
- 이유: 3개 초과 시 사장님이 무엇을 먼저 해야
        할지 판단 불가 → 행동 안 함
- 우선순위: 돈흐름 > 절약기회 > 오늘할일
- 금지: 4개 이상 카드 동시 노출

---

## [D-015] 알리고 API Key 서버에서만 호출
- 결정일: 2026-05
- 결정: 알리고 API Key는 Server Action에서만 사용
        클라이언트 컴포넌트에서 직접 호출 금지
- 이유: API Key 노출 시 무단 발송 위험
- 구현: settings 테이블에 암호화 없이 저장
        Server Action에서만 읽어서 호출
- 금지: 클라이언트에서 알리고 API 직접 호출

---

## [D-016] Action Queue 시스템 생성 주체
- 결정일: 2026-05
- 결정: Action Queue 항목은 시스템(판단/분석 엔진)만 생성
        관리자 수동 생성 절대 금지
- 이유: 관리자가 임의로 큐를 만들면 시스템 판단과 충돌 발생
- 구현: 관리자 UI에서 `action_queue` 생성 기능 금지, 감지/판단 로직에서만 enqueue
- 금지: 관리자 UI에서 action_queue INSERT

---

## [D-017] 플랫폼 수수료율 코드 하드코딩 금지
- 결정일: 2026-05
- 결정: 플랫폼 수수료율은 admin_settings에서 조회
        코드에 직접 입력 금지
- 이유: 수수료율 변경 시 코드 배포 없이 변경 가능해야 함
- 구현: admin_settings.key='platform_fee_rate'
- 금지: 코드에 fee_rate = 0.03 하드코딩

---

## [D-018] 정책키 소비 코드 연결 원칙
- 결정일: 2026-05
- 결정: admin_settings 정책키는 반드시 실제 엔진 코드에서 읽어야 함
        UI에만 존재하는 정책키 금지
- 이유: 설정만 있고 동작 안 하면 운영자 신뢰 붕괴
- 구현: 엔진 코드에서 `admin_settings` 조회 (`getAdminSettingNumber` 등) 후 없거나 무효·조회 실패 시 기본값 fallback (realmyos는 `POLICY_SETTING_DEFAULTS`, 식당OS는 동일 수치와 맞춘 로컬 폴백)
- 금지: 정책키 정의·시드만 하고 소비 코드 없이 방치

---

## [D-019] 주문 상태 이중 축 확정
- 결정일: 2026-05
- 결정:
  orders.status = 거래상태 (원장용)
    → 'draft' | 'confirmed' | 'cancelled'
    → `OrderStatus` 타입
  orders.order_status = 운영상태 (운영용)
    → '접수'|'확인'|'출고준비'|'출고완료'|'납품완료'|'취소'
    → `OrderOperationStatus` 타입
- 이유: 운영 처리와 회계 원장은 다른 목적
        섞으면 잔액 계산 오류 발생
- 금지: 두 상태 혼용 / 하나로 합치는 것

---

## [D-020] B2B 가격정책 엔진 핵심 원칙
- 결정일: 2026-05-14
- 결정자: 정무님
- 결정 (요약):
  - **supplier_basis (옵션 B)**: 공급자에게 인정하는 **납품 기준가**. **`commerce_product_listings.commerce_price`는 supplier_basis로 사용하지 않는다.** 판매가(**customer_charge**, 식당 실결제)와 납품가(**supplier_basis**)는 **반드시 분리**한다.
  - **customer_charge**: 식당이 실제 결제하는 금액. **platform_margin = customer_charge − supplier_payable** 로 플랫폼 마진 구조를 드러낸다.
  - **supplier_payable**: `supplier_basis`에서 공급자 부담 할인·수수료 반영 후 지급 예정액(정책 식: `supplier_payable = supplier_basis − supplier_discount − platform_fee`; 세부는 PRODUCT.md·구현 시 스냅샷에 고정).
  - **platform_fee (초기 정책, 안 B)**: `platform_fee = customer_charge × fee_rate` (`fee_rate`는 `admin_settings.platform_fee_rate` 등 기존 **[D-017]** 축 유지). **fee(원장·ERP bookkeeping)** 와 **margin(플랫폼 economics)** 는 개념적으로 분리해 추적한다.
  - **customer_product_prices ↔ storefront**: **직접 연결하지 않는다.** `customer_product_prices`는 참고·제안 근거(공급자 CRM 캐시)이며, **storefront 적용 가격의 SSOT는 향후 `pricing_policies`**(미구현)로 둔다.
  - **immutable ERP snapshot**: 가격은 **주문 생성 시점**에 스냅샷으로 확정하고, **allocation / supplier_payables / payments 대사**는 해당 스냅샷을 따른다. 이후 listing·정책 변경이 **기존 주문 금액을 바꾸지 않는다** (**[D-003]** 과 정합).
- 이유: 할인 엔진이 단순 UI가 아니라 **플랫폼 마진**과 **공급자 payable**을 동시에 정하므로, 한 축(`commerce_price`만)으로 receivable·allocation·정산을 섞으면 회계·감사가 붕괴된다.
- 구현: 본 결정은 **정책 확정** 단계. 스키마·코드 반영은 별도 Epic·migration 승인 후 진행 (`tasks.md` **`[DISCOUNT-ENGINE-001]`**).
- 금지: `commerce_price`를 supplier_basis로 취급하기 · `customer_product_prices`를 storefront 가격 결정에 직접 연결하기 · 확정 스냅샷 없이 할인만으로 allocation/payable 역산하기 · 본 결정과 모순되는 임의 컬럼 추가(승인 전).

---

## [D-021] 회계 이벤트 정책 핵심 원칙 (append-only · 운영/회계 분리)
- 결정일: 2026-05-14
- 결정자: 정무님
- 근거 문서: [`docs/ACCOUNTING-EVENT-MODEL-001.md`](./ACCOUNTING-EVENT-MODEL-001.md), [`docs/ACCOUNTING-REVERSAL-DESIGN-001.md`](./ACCOUNTING-REVERSAL-DESIGN-001.md)
- 연계 결정: **[D-017]**(수수료율·마진 계산 축), **[D-020]**(가격·스냅샷·allocation·payable 대사), **`[PLATFORM-ERP-001]`**(`tasks.md` — 플랫폼 주문·ERP·정산 구현 Epic)

### Q1. `commerce_order_allocations` **confirmed** 이후 주문 취소
- **확정: 옵션 A — 항상 수동 처리**
- **원칙**:
  - `pending` allocation 까지는 **자동 `cancelled` 허용**(현행 코드와 정합).
  - **`confirmed` allocation 이후** 취소·역처리는 **반드시 관리자 수동 검토** — 자동 rollback 금지.
  - confirmed 이후는 “운영 취소”가 아니라 **회계 이벤트 reversal** 영역으로 본다.
  - **`supplier_payables` 자동 rollback 금지**, **settlement 자동 rollback 금지**, **KPI 자동 역전 금지**.
  - **원본 row 금액 overwrite 금지** — 상쇄는 **새 회계 이벤트(append-only 방향)** 로만 한다.

### Q2. KPI 취소·환불 반영 시점
- **확정: 옵션 B — 환불 완료(reversal/refund 이벤트 완료) 시점 기준**
- **원칙**:
  - **운영 상태(`cancelled` 등) ≠ 회계 상태(`refunded` / `reversed` 등)** — 분리 유지.
  - **platform revenue · receivable · platform margin · settlement balance** 는 **실제 reversal·refund 완료**를 반영한 뒤에만 변경한다는 것을 목표 원칙으로 둔다.
  - **`cancelled` 만으로 KPI·매출 숫자를 바꾸지 않는다**(현행 구현과의 차이는 구현 과제로 남김).

### Q3. 부분 환불
- **확정: 옵션 A — 현재 주문 단위만**
- **원칙**:
  - **P0/P1** 단계에서 **부분 환불·수량 단위 partial refund 로직 금지**.
  - 품목(line) 단위 취소·수량 split 은 **장기 과제**(현행 스키마: 품목당 allocation 1건 등 — `ACCOUNTING-REVERSAL-DESIGN-001` 정합).

### 최종 원칙 (요약)
1. confirmed 이후 **자동 rollback 최소화**(수동 reversal 중심).
2. **refund ≠ cancellation**(취소만으로 회계 확정을 바꾸지 않음).
3. **KPI는 reversal/refund 완료 기준**(목표; 구현은 별도).
4. **immutable snapshot 유지**(**[D-020]**·**[D-003]** 과 정합).
5. 기존 ledger row **overwrite 금지** — reversal·조정은 **추가 이벤트** 우선.
6. 회계 이벤트는 **append-only 방향**을 원칙으로 한다.

---

## [D-022] `payments.type` 회계 이벤트 taxonomy 정책 (enforcement 순서 · legacy NULL · settlement 명칭)

- **결정일**: 2026-05-14
- **결정자**: 정무님
- **근거 문서**: [`docs/PAYMENTS-TAXONOMY-DESIGN-001.md`](./PAYMENTS-TAXONOMY-DESIGN-001.md) (**PAYMENTS-TAXONOMY-DESIGN-001**), [`docs/ACCOUNTING-EVENT-MODEL-001.md`](./ACCOUNTING-EVENT-MODEL-001.md) (**ACCOUNTING-EVENT-MODEL-001**), **`tasks.md` [ACCOUNTING-EVENT-POLICY-001]** / **`DECISIONS.md` [D-021]** (회계 이벤트 append-only·운영/회계 분리 정책 본문)
- **연계 결정**: **[D-021]** — **append-only 회계 이벤트·overwrite 금지·reversal row 기반** 원칙. **[D-022]** — 동일 원장 위에서 **`payments.type` taxonomy를 언제·어떻게 강제할지**의 **순서·부채 관리** 원칙. **둘은 함께 동작**한다: append-only·스냅샷 불변은 [D-021], type 의미 정렬·DB enforcement 타이밍은 [D-022].

### Q1. `payments.type` NULL 허용 기간

- **확정: 옵션 B**
- **원칙**:
  - **기존 row**: `type` **NULL 허용 유지** — **legacy debt**(migration·백필 대상으로만 추적, 임의 backfill 금지).
  - **신규 row**: **회계 이벤트로 취급되는 INSERT부터 `type` 명시 필수** 방향(앱·RPC 가드 준비는 별도 Epic).
  - **즉시 DB `NOT NULL` 강제 금지** — 잘못된 의미 영구 저장 위험·settlement/payout semantics 미확정 상태에서 enforcement 선행 시 **향후 migration 비용 증가** 우려.
  - **최종 목표**: `type` **`NOT NULL`** — **[D-022] 이후 단계(P1 이후)** 에서만 검토.
  - **KPI·aggregation**: `type IS NULL` 인 행에 대한 **집계·제외 규칙**을 명시해야 함(구현·문서 후속).
  - **신규 P0/P1 accounting flow**: **`type` 없는 INSERT 금지** 방향.

### Q2. settlement type 명칭

- **확정: 옵션 A — `type = 'settlement'` 유지**
- **원칙**:
  - 현재 `settlement`는 **최종 taxonomy가 아닌 transition taxonomy**(중간 의미 레이어).
  - **settlement lifecycle / payout chain** 미완성 상태에서 **fee / payout / accrual 등으로 명칭·행 분리 금지**(premature naming 금지).
  - **taxonomy 세분화**는 **accounting event 안정화 후**.

### Q3. taxonomy 적용(DB enforcement) 시점

- **확정: P1 범위에서 migration·CHECK·NOT NULL 등 enforcement 검토**
- **순서(고정)**:
  1. **taxonomy policy 확정**(본 결정 · `PAYMENTS-TAXONOMY-POLICY-001`)
  2. **신규 row `type` 강제 준비**(앱·RPC 레벨 가드 등)
  3. **settlement / payout lifecycle 설계 완료**
  4. **reversal chain 정책 확정**
  5. **migration enforcement (P1)**
- **원칙**: **정책 → lifecycle → enforcement**. **enforcement 선행 금지**. 현재 단계는 **semantics alignment**이며, **DB-level enforcement는 아직 아님**.

### Latent schema drift (기록만 · 임의 수정 금지)

- **관측(저장소·정책 기록, 2026-05-14)**:
  - **코드**: `accept_bid_atomic` 경로에서 `payments.status = 'planned'` INSERT(증분 migration `20260506150000_create_accept_bid_atomic.sql` 등 문서·저장소 기준).
  - **migration CHECK**: 일부 증분 migration의 `payments_status_check` 등에 **`'planned'` 미포함** 가능성(**`docs/PAYMENTS-TAXONOMY-DESIGN-001.md`**·`CONTEXT.md` **[SCHEMA-DRIFT-001]** 참조).
  - **운영 DB(2026-05-14 기준 확인)**: `status = 'planned'` 인 `payments` row **없음**(단, **baseline 적용 순서·환경별 차이**로 해석 여지 있음 — **P1 baseline synchronization 시 재검증**).
- **판단**: 단순 dead code 가설만으로 닫지 않고, **코드 / migration / 운영 데이터가 동일 semantics를 공유하지 않을 수 있는 상태**를 **latent schema drift**로 본다. **settlement/payout 구현 전·type enforcement 전**에 정리·검증 필요. **본 턴에서는 발견·기록만**, 임의 스키마·데이터 수정 금지.

### 금지

- semantics alignment 이전 **임의 taxonomy 변경·NULL 임의 backfill·`settlement` 임의 세분화·CHECK만 선행 추가** 등.

---

## [D-023] settlement / payout / reversal chain lifecycle 정책 (finality · paid 정의 · outbound 수렴)

- **결정일**: 2026-05-14
- **결정자**: 정무님
- **근거 문서**: [`docs/ACCOUNTING-LIFECYCLE-DESIGN-001.md`](./ACCOUNTING-LIFECYCLE-DESIGN-001.md) (**ACCOUNTING-LIFECYCLE-DESIGN-001**), [`docs/ACCOUNTING-EVENT-MODEL-001.md`](./ACCOUNTING-EVENT-MODEL-001.md), [`docs/PAYMENTS-TAXONOMY-DESIGN-001.md`](./PAYMENTS-TAXONOMY-DESIGN-001.md)
- **연계 결정**:
  - **[D-021]** — **append-only accounting** 원칙(overwrite 금지·reversal row 방향·운영/회계 분리).
  - **[D-022]** — **`payments.type` taxonomy enforcement sequencing**(정책 → lifecycle → enforcement; P1 이후 DB 강제).
  - **[D-023]** — **lifecycle finality** 정의: **settlement ≠ paid**, **payout = 자금 사실 finality**, **settlement row 불변**, **outbound append-only 수렴** 방향.
  - **세 결정은 함께 동작**한다: [D-021]이 원장 행위 원칙, [D-022]가 분류·강제 순서, [D-023]가 **정산·지급·역처리의 의미와 종료 시점**을 고정한다.
- **현재 구조 고지**: 저장소는 **transition state**다 — storefront **append-only reversal row**, RFQ outbound **`reverse_disbursement`의 UPDATE `reversed`**, RFQ **`processSettlement` 즉시 `confirmed`**, storefront **`supplier_payables.paid` 전이 미구현** 등이 **공존**한다. **[D-023]** 는 이 상태를 **완성형으로 가정하지 않고**, **최종 방향·정책 닫기(policy closure)** 만 확정한다. **RFQ outbound UPDATE 패턴**은 본 결정상 **transition debt**이며, **즉시 제거 대상이 아니라** 정책·lifecycle·taxonomy 정렬 후 **P1에서 append-only로 점진 이행**한다.

### Q1. `supplier_payables` **`paid`** 의미

- **확정: 옵션 B**
- **원칙**:
  - **`paid` = 실제 자금 이동(또는 동등한 최종 지급 사실) 확인 이후**만 허용하는 **accounting finality** 축.
  - **`settlement` 완료만으로 `paid` 전환 금지** — settlement는 **회계 인식 이벤트**이지 공급자 지급 완료가 아니다.
  - **`settlement ≠ paid`** — **false finality**(미지급인데 paid)가 **KPI margin 왜곡**보다 위험하다는 판단으로 분리를 고정한다.
  - **`supplier_payables.paid`** 는 **외부 대사(reconciliation)** 성격을 띤다.

### Q2. settlement 역처리 범위

- **확정: 옵션 A**
- **원칙**:
  - **settlement `payments` row 자체는 append-only 불변** — **DELETE·금액 overwrite·UPDATE rollback 금지**.
  - **역효과**는 **adjustment** 또는 **reversal 계열 회계 이벤트(새 row)** 로만 처리한다.
  - settlement는 **상태 토글**이 아니라 **이미 발생한 회계 이벤트**로 취급한다.
  - “잘못된 settlement 삭제 후 재작성” **금지** — **[D-021]**·**[D-003]** 정합.

### Q3. `reverse_disbursement` (UPDATE `reversed`) 이행 시점

- **확정: 옵션 A — P1에서 append-only 방향으로 전환 검토**
- **원칙**:
  - **현행 UPDATE `reversed` = transition debt** — storefront inbound reversal(**INSERT append-only**)과 **semantics 불일치**.
  - **INSERT reversal vs UPDATE `reversed` 장기 공존 금지** — 수렴 목표는 **outbound accounting도 append-only**.
  - **즉시 강제 전환 금지** — 아래 순서 고정.
- **전환 순서(고정)**:
  1. **lifecycle semantics 확정**(본 **[D-023]** · `ACCOUNTING-LIFECYCLE-POLICY-001`)
  2. **taxonomy stabilization**(**[D-022]** 궤적)
  3. **settlement / payout 구조 확정**(구현 설계·승인)
  4. **P1 outbound append-only 전환**(migration·RPC 별도 승인)

### 최종 원칙 (6개, 고정)

1. **`settlement ≠ paid`**
2. **`paid` = 실제 지급 finality**(Q1)
3. **settlement rollback 금지**(Q2)
4. **correction = adjustment / reversal event**(새 회계 이벤트)
5. **outbound accounting도 append-only로 수렴**하는 것을 목표로 한다
6. **UPDATE `reversed`는 transition debt**로 관리하며 P1에서 수렴 이행한다(Q3)

### 금지

- settlement row **삭제·덮어쓰기**로 “정산 취소”하기 · **`settlement` 만으로 `supplier_payables` 를 `paid` 로 올리기** · lifecycle·taxonomy 확정 전 **`reverse_disbursement` 임의 개편**으로 운영 리스크 키우기.

---

## [D-024] append-only convergence 실행 정책 (reversal 금액 부호 · P1 수렴 범위)

- **결정일**: 2026-05-14
- **결정자**: 정무님
- **근거 문서**: [`docs/APPEND-ONLY-CONVERGENCE-DESIGN-001.md`](./APPEND-ONLY-CONVERGENCE-DESIGN-001.md) (**APPEND-ONLY-CONVERGENCE-DESIGN-001**), 구현 범위 명세 [`docs/APPEND-ONLY-CONVERGENCE-P1-SPEC-001.md`](./APPEND-ONLY-CONVERGENCE-P1-SPEC-001.md) (**APPEND-ONLY-CONVERGENCE-P1-SPEC-001**)
- **연계 결정**:
  - **[D-021]** — append-only accounting **원칙**(overwrite 금지·reversal row 방향).
  - **[D-022]** — **`payments.type` taxonomy enforcement sequencing** — P1에서는 **NOT NULL·CHECK가 아닌** 가드 1차만.
  - **[D-023]** — lifecycle **finality**(`paid`·settlement 불변·`UPDATE reversed` = transition debt).
  - **[D-024]** — 위를 **`payments` reversal·취소 경로 실행** 및 **P1 구현 범위**로 고정.
  - **네 결정은 함께 동작**한다: 원칙([D-021])·분류 순서([D-022])·지급·정산 의미([D-023])·**수렴 실행·P1 범위([D-024])**를 한 세트로 적용한다.
- **현재 구조 고지**: 저장소는 **transition state**이며, **즉시 완전 append-only 전환을 가정하지 않는다**. P1은 **`APPEND-ONLY-CONVERGENCE-P1-SPEC-001`** 범위 내 **점진 이행**만 한다.

### Q1. 상쇅(reversal) row의 **`amount` 부호**

- **확정: 옵션 A — reversal row도 `amount`는 양수 유지**
- **원칙**:
  - reversal 의미는 **`reversal_of_id` · `type` · lifecycle** 으로 표현 — **음수 금액 혼합 금지**.
  - **KPI** = **gross − reversal aggregation** 유지(storefront P0·[KPI-REVERSAL-P0-001]와 충돌 없음).
  - **inbound / outbound 동일 철학** — settlement·payout lifecycle 해석 충돌 방지.
  - 기존 **storefront append-only reversal semantics 유지**.

### Q2. **`cancelPayment`(패턴 α)** 통합 시점

- **확정: 옵션 A — P1 outbound append-only 전환과 동시에 수렴**
- **원칙**:
  - **`cancelPayment`의 `UPDATE reversed`** = **transition debt** — **[D-023]**·`APPEND-ONLY-CONVERGENCE-DESIGN-001` 과 정합.
  - P1에서 **`reverse_disbursement` 수렴과 함께** **INSERT append-only semantics** 로 통일.
  - **`UPDATE reversed` 패턴은 장기 제거**([D-021] 목표).

### 최종 수렴 목표 (패턴 3개)

| 패턴 | 현재 | 목표 |
|------|------|------|
| **A** storefront inbound 상쇅 | INSERT append-only **(완료)** | 유지 |
| **B** RFQ outbound `reverse_disbursement` | UPDATE `reversed` | **P1 → INSERT append-only** |
| **α** `cancelPayment` inbound | UPDATE `reversed` | **P1 → INSERT append-only** |

- **최종 상태(목표)**: 모든 reversal = **INSERT append-only** · 모든 correction = **새 이벤트** · **overwrite 없음**.

### P1에서 다루는 범위(고정)

- **포함**: 패턴 B·α의 **INSERT 상쇅 전환**(명세: **`APPEND-ONLY-CONVERGENCE-P1-SPEC-001`**), **신규 accounting row `type` 가드 1차**(Server Action·주요 RPC, [D-022] 유지).
- **제외**: legacy NULL **backfill** · DB **NOT NULL/CHECK** enforcement · settlement correction · payout/`paid` lifecycle · partial cancellation · 외부 대사·복식부기·reverse-of-reversal·adjustment taxonomy 확정 등 — **별 Epic·승인**.

### transition debt 관리 원칙

- **`reverse_disbursement` 즉시 DROP/제거 금지** — **deprecated** 후 **이중 경로 검증**·제거([D-023]·DESIGN-001).
- **`purchases.status` 오염 방지**·**운영 semantics 보존**이 속도보다 우선.

### 금지

- **음수 `amount` 혼합** · P1 밖 **settlement/payout 착수** · **[D-022]** 위반 **즉시 DB enforcement** · 명세 없이 **RPC 단독 변경**.

---

## 추가 원칙
새로운 결정이 생기면 아래 형식으로 추가:

## [D-NNN] 결정 제목
- 결정일: YYYY-MM
- 결정: 무엇을 결정했는가
- 이유: 왜 이렇게 결정했는가
- 구현: 어떻게 구현하는가
- 금지: 절대 하면 안 되는 것

