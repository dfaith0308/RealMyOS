# ERP-ROADMAP-001 — 관리자OS ERP **실제 구현** 로드맵 (정책 확정 이후)

> **성격**: **구현 로드맵 재정리** 문서. 새 정책을 발명하지 않으며 **[D-021]~[D-024]** · `APPEND-ONLY-CONVERGENCE-P1-SPEC-001` · `ACCOUNTING-LIFECYCLE-DESIGN-001` · `PAYMENTS-TAXONOMY-*` · **`[PLATFORM-ERP-001]`** 산출물과 정합한다.  
> **금지**: 임시방편·정책 충돌 shortcut·「나중에 정리」식 순서 생략.  
> **전제**: `tasks.md`에 기록된 P0~P2 구현은 **저장소 기준으로 존재**하나, **운영 DB 적용·리허설 증거**는 별도 승인·실행이다 — **코드만으로 “운영 완료”라고 부르지 않는다.**

**근거 문서 (교차)**: `PLATFORM-ERP-ARCH-001`(스냅샷 일부는 P0 이전 시점 — P2-003·`commerce_order_id` 이후 갭은 본 로드맵·`tasks.md` 우선), `PLATFORM-ERP-DESIGN-001`, `APPEND-ONLY-CONVERGENCE-P1-SPEC-001`, `ACCOUNTING-LIFECYCLE-DESIGN-001`, `DECISIONS.md` [D-021]~[D-024], `docs/TEST-DEV/TEST-RUN-ERP-001.md`, `docs/TEST.md`.

---

## SECTION 1 — 현재 ERP 완성도 평가 (냉정 %)

**정의를 둔다** (혼동 방지):

| 정의 | 의미 | 완성도 (주관적이나 보수적) |
|------|------|---------------------------|
| **A. Storefront 플랫폼 주문 → `payments`·allocation·payable·취소·KPI** 의 **코드 경로 존재** | migration·액션·UI가 저장소에 있음 | **~52%** |
| **B. 위 루프가 운영 DB에 적용·`TEST-RUN-ERP-001` 등으로 증명됨** | 실제 돈·숫자 신뢰 | **~35~45%** (환경·적용 이력에 따라 가변) |
| **C. “ERP 완성” = RFQ·Storefront **통합** 정산·settlement·payout·대사·자동화까지** | 월말·지급·감사 가능 | **~22~28%** |

**한 줄**: 정책·모델링은 상위권이나, **통합 회계·지급 finality·자동 대사**는 하위권. **ARCH-001 표 중 “없음”으로 남은 축**은 상당수가 **부분적으로 메워졌으나** (`commerce_order_id`, `commerce_order_allocations`, `supplier_payables`) **정산 KPI·`processSettlement`·PG·payout** 은 여전히 **RFQ `orders` 중심 또는 미구현**이다.

---

## SECTION 2 — 남은 작업 전체 목록 (대분류 → 세부)

### A. 회계 축선 (append-only·`payments` SSOT)

1. **`[APPEND-ONLY-CONVERGENCE-P1-001]` 전부** (`APPEND-ONLY-CONVERGENCE-P1-SPEC-001` 준수)  
   - `insert_outbound_reversal`(가칭) + `reverse_disbursement` deprecated 이중 경로 운영·제거 순서  
   - `cancelPayment` → inbound INSERT 상쇅 + 기존 경로 deprecate  
   - **type 가드 1차** (신규 INSERT만; [D-022] 위반 금지)  
   - KPI·`purchases.status`·`admin_logs` 회귀  
2. **기존 `UPDATE reversed` 잔존 구간 소거 계획** (측정 쿼리·운영 리허설 게이트)

### B. 생명주기 ([D-023]·`ACCOUNTING-LIFECYCLE-DESIGN-001`)

3. **`supplier_payables.paid` / 지급 사실(payout)** — [D-023] Q1: **settlement ≠ paid**  
   - payout 이벤트 모델(최소: 수동 확정 + 불변 로그)  
   - `paid` 전이 조건·금지 규칙 UI·액션 반영  
4. **settlement cycle (storefront 수수료·플랫폼 매출)**  
   - `processSettlement` 등 **데이터 소스**가 `orders`만인 구조와 **storefront `payments`** 통합 또는 **명시적 이중 리포트**(라벨 분리) — 임시 합산 금지  
5. **settlement ↔ payable 연결** (문서상 갭; allocation·fee·payable 대사 규칙)

### C. 운영·품질 (정책과 무충돌)

6. **운영 migration 적용 + 스테이징/운영 리허설** (`TEST.md`·`TEST-RUN-ERP-001`)  
7. **forensic / admin tooling** — 주문·`payments`·allocation·payable **한 화면 추적**, export 감사  
8. **PG(Toss 등)·자동 입금 확인** — `PAYMENT-FORENSIC-001` 기준 미연동 구간  
9. **refund automation** — 정책상 P1 비범위; 후속 Epic  
10. **partial cancellation** — 비범위; 별 정책·Epic  
11. **external reconciliation·ERP export·double-entry 방향** — P2+

### D. 가격·스냅샷 (이미 P0 있음 → “완성”은 연결)

12. **`pricing_policies`·스냅샷**과 allocation·`supplier_payables`·KPI **불변성 검증** 및 할인 엔진(`[DISCOUNT-ENGINE-001]`) 연계 구현

---

## SECTION 3 — 의존성 기반 구현 순서 (이유)

**원칙**: (1) **의미(semantics) 수렴**이 스키마 확장보다 선행 — 안 그러면 컬럼만 늘고 숫자는 어긋난다. (2) **운영 증거**가 없으면 다음 단계 승인 불가.

| 순서 | 묶음 | 이유 |
|------|------|------|
| **1** | **`[APPEND-ONLY-CONVERGENCE-P1-001]`** | [D-024]로 고정. outbound·α·type 가드 없이 **지급·정산·역분개**를 확장하면 **transition debt가 영구화**된다. |
| **2** | **P1 완료 후 KPI·리포트 정합 검증** | gross/net·allocation·payable 집계가 **INSERT reversal** 모델과 맞는지 확인. |
| **3** | **`supplier_payables` → `paid` + payout 최소 모델** | [D-023]상 **실지급 없이 paid 금지**. 공급자 지급 운영을 열려면 반드시 필요. |
| **4** | **settlement cycle을 storefront 축과 합치는 설계 확정 + 구현** | `getPlatformRevenue`/`processSettlement`의 **`orders` 전제**와 충돌하지 않게 **명시적 분기 또는 통합 집계 레이어** — 여기서 shortcut 하면 이중·누락 매출. |
| **5** | **PG·자동 입금·refund** | 채권·지급 의미가 고정된 뒤에야 안전. |
| **6** | **대사·export·복식** | SSOT·lifecycle 안정 후. |

---

## SECTION 4 — 반드시 먼저 해야 하는 작업 TOP 5

1. **`[APPEND-ONLY-CONVERGENCE-P1-001]` 실행** — 명세서 순서 준수 · `reverse_disbursement` 즉시 제거 금지.  
2. **스테이징(또는 운영) DB에 누적 migration 적용 + `TEST-RUN-ERP-001` 증거** — “구현됨”과 “운영 가능” 분리 해소.  
3. **`payments` / allocation / payable **집계 규칙**을 문서·코드·UI 한 줄로 고정** (INSERT reversal·양수 amount·type 가드 반영).  
4. **`supplier_payables.paid`의 정의 이행** — payout 최소 이벤트 없이 [D-023] 위반 소지 제거.  
5. **RFQ 정산 UI vs storefront KPI의 출처 라벨링** — 통합 전 **이중 계상·누락** 방지 (`PLATFORM-ERP-ARCH-001` SECTION 7 클래스 이슈).

---

## SECTION 5 — 지금 건드리면 위험한 것 TOP 5

1. **`processSettlement`에 `commerce_orders.id`를 `order_id`로 우겨 넣기** — `orders` 검증 로직과 **충돌** (`PLATFORM-ERP-DESIGN-001` 경고).  
2. **`supplier_payables.paid` 자동 플립 (은행 대사·payout 없이)** — [D-023] **직접 위반**.  
3. **`reverse_disbursement` RPC 조기 삭제** — INSERT 경로·KPI 검증 전 **운영 중단·`purchases.status` 오염** 위험.  
4. **`payments.type` DB NOT NULL/CHECK 즉시 도입** — [D-022] sequencing 위반; 가드 안정 전 **운영 insert 전면 정지** 위험.  
5. **storefront 미수를 공급자 `customers` 원장에 억지 매핑** — 소유 주체 혼선 (`PLATFORM-ERP-DESIGN-001` receivable owner); **임시 조인 금지**.

---

## SECTION 6 — transition debt 목록 재정리 (P0 / P1 / P2)

| 단계 | 항목 | 상태 |
|------|------|------|
| **P0** | storefront inbound reversal = **INSERT append-only** | **완료** ([ACCOUNTING-REVERSAL-P0-001]) |
| **P0** | KPI gross − reversal | **완료** ([KPI-REVERSAL-P0-001]) |
| **P0** | `commerce_orders` `paid` → `payments` + `commerce_order_id` | **코드 존재**; 운영 적용은 별도 |
| **P0** | allocation + `supplier_payables` 원장 | **코드 존재**; 운영 적용은 별도 |
| **P1** | outbound `reverse_disbursement` **UPDATE** | **transition debt** → INSERT 수렴 예정 |
| **P1** | `cancelPayment` **UPDATE** (α) | **transition debt** → INSERT 수렴 예정 |
| **P1** | 신규 row **type 가드** (NOT NULL은 아님) | **미완** |
| **P1** | DESIGN-001 vs [D-024] **시점 문구** 정렬 | **문서 debt** (구현 차단은 아님) |
| **P2** | settlement correction append-only | 정책·별 Epic |
| **P2** | payout 완전 자동화·은행 대사 | 정책·외부 시스템 |
| **P2** | partial cancel · refund automation | 별 승인 |
| **P2** | double-entry·외부 ERP | 방향성만 |

---

## SECTION 7 — 운영 위험도 기준 우선순위 (HIGH / MID / LOW)

| 우선순위 | 항목 | 위험 요약 |
|----------|------|-----------|
| **HIGH** | P1 append-only 수렴 | 잘못되면 **원장·KPI·매입상태 동시 오염**. |
| **HIGH** | `paid`/payout 도입 전후 | **법·운영상 지급 착오** 가능. |
| **HIGH** | settlement 소스 통합 | **이중 매출·누락 매출** — 감사 치명타. |
| **MID** | 운영 migration 일괄 적용 | 롤백 비용; RLS·데이터 마이그레이션 순서. |
| **MID** | PG 연동 | 보안·멱등·환불 분쟁. |
| **LOW** | export 포맷·리포트 UI | 기능은 중요하나 **역기능보다 낮은 치명도**. |

---

## SECTION 8 — 정무님 예상 업무지시 횟수 (현실적)

**“지시”** = 범위 승인 + (필요 시) migration 적용 승인 + 운영 리허설 서명 수준의 **의사결정 단위**로 본다.

- **최소**(핵심 루프만 안전하게): **약 12~18회** (P1 묶음·DB 적용·paid/payout·settlement 통합·PG 각 2~3회 분할).  
- **권장**(품질·회귀 여유): **약 20~30회**.  
- **“ERP 완성” C정의까지**(대사·자동화·이중 제도): **약 35~50회+** (월 단위 반복 포함).

---

## SECTION 9 — 3회 / 5회 / 10회 지시 시나리오 비교

| 시나리오 | 품질 | 위험 | 속도 |
|----------|------|------|------|
| **3회** | 낮음 — P1·DB·settlement를 한 방에 묶기 쉬움 | **최고** — 롤백·의미 혼선 | 겉으로 빠름 |
| **5회** | 중간 — P1·검증·paid 중 일부만 | **높음** — settlement 통합이 밀리면 **기술 부채** 잔존 | 중간 |
| **10회** | **권장** — 단계마다 회귀·문서 갱신 | **중간** — 통제 가능 | 느리지만 **되돌리기 쉬움** |

---

## SECTION 10 — 최종 권장 실행 전략

1. **지시 단위를 작게** — [SECTION 9] **10회 전후**를 한 사이클 목표로 삼고, 각 지시 끝에 **`TEST-RUN-ERP-001`** 또는 동급 증거를 붙인다.  
2. **P1 append-only를 settlement·paid 확장보다 반드시 선행**한다.  
3. **통합 정산 UI를 “한 번에” 만들지 말고**, 먼저 **데이터 소스 라벨·집계 SSOT**를 문서·화면에 고정한다 ([SECTION 4] TOP5-5).  
4. **`PLATFORM-ERP-ARCH-001` 갱신 포렌식**을 P1 완료 직후 한 번 돌려 — 문서·코드 괴리를 줄인다.

---

## SECTION 11 — “지금 ERP가 실제 운영 가능한가?” 냉정 평가

- **무통장·수동 입금 확인·수동 주문 상태·수동 allocation·수동 payable 확정** 전제라면: **소규모·통제된 운영은 가능할 수 있다** (인력·이중 확인 비용 큼).  
- **“실제 ERP”** — 즉 **월말 결산·지급 finality·RFQ·storefront 단일 진실·자동 대사** 관점: **아니다** (~[SECTION 1] C정의).  
- **코드가 있어도 운영 DB 미적용이면** 운영 가능이라 말하면 **거짓**에 가깝다.

---

## SECTION 12 — 남은 핵심 설계 논쟁 여부

**있다.** 구현 착수 전에 **짧게라도 닫아야 할 것**:

1. **storefront 매출·수수료를 `processSettlement`(RFQ `orders` 축)와 어떻게 합칠 것인가** — 통합 집계 레이어 vs 이중 리포트 vs 기간별 수동 조정 (정책 [D-023]과 충돌 없이).  
2. **`commerce_orders` ↔ 플랫폼 “고객” 식별자** — `customer_id` 부재 해소 시점·모델 (`PLATFORM-ERP-DESIGN-001`).  
3. **PG 도입 시 `payments` lifecycle** — webhook·멱등·환불과 append-only 역행의 순서.  
4. **adjustment taxonomy** — [D-024] P1 제외; 정산 보정을 **어떤 type·이벤트**로 남길지는 **아직 열린 설계 논쟁**.

---

**본 문서는 구현 지시가 아니라 로드맵이다. 구현은 `tasks.md` Epic·별 지시·승인 migration에 따른다.**
