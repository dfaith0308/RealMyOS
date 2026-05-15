| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**SYSTEM-BOUNDARY-AUDIT-001**: 관리자OS·식당OS(storefront)·공급자OS(disbursements 등) **경계**에서 상태 불일치·tenant·append-only·KPI·UI/서버 불일치 **위험만** 정적 코드 기준으로 식별한다. **구현·migration·아키텍처 변경 없음.**

## 관련 `tasks.md` ID

- **[SYSTEM-BOUNDARY-AUDIT-001]**

## 수정 파일 목록

- `docs/tasks.md` — 본 ID 작업 이력(블록 존재 시 보강 없이 worklog만 추가)
- `docs/worklogs/2026-05-14_audit_system-boundary-001.md` — 본 파일

## migration 여부

없음.

## 테스트 결과

- 코드 변경 없음. `npx tsc` 미실행(변경 없음).

---

## SECTION 1 — 전체 lifecycle 감사 결과

**추적 경로 (realmyos 기준):**  
`commerce_orders` (관리자 `updateCommerceOrderStatus`) → `paid` 시 `tryRecordPlatformReceivablePayment` (inbound, `commerce_order_id`, 멱등·부분 unique) → `createCommerceOrderAllocations` → allocation **확정** → `supplier_payables` → `markSupplierPayableAsPaid` → outbound `payout_outbound` → 취소 시 `processCommerceOrderCancelledAccountingP0` (inbound reversal append-only, payable unpaid 취소 등).

| 위험 유형 | 판단 (코드 기준) |
|-----------|------------------|
| **paid인데 allocation 없음** | 가능 — `tryRecordPlatformReceivablePayment`/allocation은 best-effort·별도 실패 경로; UI·문서에 이미 언급. |
| **payable paid인데 payout 없음** | `markSupplierPayableAsPaid`가 paid인데 payout 없으면 **에러 반환**(멱등 복구 경로). corruption 자동 허용 아님. |
| **cancelled인데 payable unpaid 유지** | 취소 시 `cancelSupplierPayable` 루프; 실패 시 `manual_review` 로그 — **부분 실패** 가능. |
| **refunded인데 reversal 없음** | 가능 — REFUND-LIFECYCLE-P1-001에서 **KPI gross만** 최소 보정; 회계 이벤트 자동 추가 없음. |
| **중복 inbound** | `updateCommerceOrderStatus` 낙관적 잠금 + DB unique(`commerce_order_id`+`reversal_of_id` null) + `23505` 처리. |
| **중복 payout** | `markSupplierPayableAsPaid`에서 memo 기준 중복 조회 후 거절. |
| **중복 reversal** | `createPaymentReversalRowInternal`·`insertOutboundReversal` dup 시 skip/에러. |
| **orphan payable** | 정상 경로는 allocation 기반 INSERT; **수동 DB/버그** 외에는 코드만으로는 강제 보장 없음. |

**식당OS 주문 생성:** `realmyos` 저장소 내 `commerce_orders` INSERT는 주로 **별도 앱(resturant_os 등)** — 본 감사는 **관리자OS 액션·공급자 disbursement** 중심; 식당→주문 경계는 **해당 앱 RLS·세션 tenant**에 의존(추가 코드 열람 없음 시 가정 아님 — **경계는 repo 간**).

---

## SECTION 2 — tenant isolation 감사 결과

| 경로 | 결과 |
|------|------|
| **관리자 `getCommerceOrderDetail`** | `requireAdmin` 후 `id`만으로 조회 — **관리자는 전 테넌트 주문 조회 가능(설계상)**. 레스토랑 사용자가 이 액션 호출 불가(`middleware` admin만 `/admin`). |
| **관리자 payables/allocations** | `requireAdmin`, 목록은 **플랫폼 운영용 전역 조회** 패턴. |
| **공급자 `getDisbursementList`** | `getAuthCtx` + `payer_tenant_id`/`tenant_id` OR 스코프 — **본인 테넌트 outbound만**. |
| **insertOutboundReversal** | `tenantOutboundPayerScope(ctx.tenant_id)` — 타 테넌트 지급 row 조작 불가(정상). |
| **tenant leakage (레스토랑↔레스토랑)** | 관리자 경로는 의도적 광역; **비관리자는 `/admin` 차단**. 추가 leakage는 **RLS 정책·resturant_os** 쪽 별도 검증 권장. |

**CRITICAL tenant leakage:** 관리자 세션으로의 **의도된** cross-tenant 조회만 확인; 비관리자가 타 tenant `commerce_orders`를 읽는 **Server Action 경로는 본 범위에서 미발견**(admin 전용).

---

## SECTION 3 — append-only consistency 감사 결과

| 항목 | 결과 |
|------|------|
| **원본 payments UPDATE** | storefront reversal·outbound는 **INSERT 상쇅** 패턴; `cancelDisbursement`는 append 우선. |
| **reversal 없이 status만 변경** | RFQ 레거시 `reverse_disbursement` RPC **fallback 잔존**(`cancelDisbursement`) — `payout_outbound`는 차단 후 **RPC 미호출**으로 우회 수정됨(이전 턴). |
| **`reverse_disbursement` debt** | non-`payout_outbound` 실패 시 여전히 호출 가능 — **transition debt**로 문서화된 상태 유지. |
| **`payout_outbound` 우회** | `insertOutboundReversal` 차단 + `cancelDisbursement` early return — **현 코드 기준 우회 닫힘**. |
| **`cancelPayment` vs refund lifecycle** | 본 감사 범위에서 분기 전수 미스캔; storefront 취소는 `commerce-reversal` 경로와 분리 유지. |

---

## SECTION 4 — KPI consistency 감사 결과

- **gross/net:** refund 케이스 B gross 제외·reversal 합 차감 — 한계는 **`PAY_FETCH_LIMIT`** 내 스냅샷.
- **paid/unpaid payable:** PLATFORM-MARGIN-FIX-001로 **분리 노출**; 합은 기존과 동일.
- **cancelled/refunded vs KPI:** refunded+reversal 없음 gross 보정; **문서 SQL vs UI** 스코프 차이는 TEST-RUN 기록됨.
- **reversal 누락:** 상한 밖 row는 집계에서 누락 가능(운영 리스크, 설계 변경 아님).

---

## SECTION 5 — UI / server mismatch 결과

| 영역 | 결과 |
|------|------|
| **payout_outbound 취소** | 서버 차단 + UI 숨김(**OPS-UX-STABILITY-001**). `type` NULL 구형 row는 UI에 취소 노출 가능·서버 차단 유지. |
| **paid payable 재지급** | 서버 거절/멱등; UI는 unpaid만 버튼. |
| **paid 주문 취소** | 모달 + 서버 전이 동일. |
| **연타** | `useTransition`·Payables `markPending` 등 — 완전 방지는 아님, DB unique가 최종 방어. |

---

## SECTION 6 — 운영 UX 리스크 결과

- 무통장/카카오 **수동 확인** 큐와 실제 입금 시차.
- **paid 후 취소** 시 payable **paid**면 manual_review 로그 — 운영자 팔로업 필요.
- 상태명·배지는 OPS-UX 이후 개선됨; 여전히 **문서·교육** 의존 구간 있음.

---

## SECTION 7 — CRITICAL 리스크 목록

**이번 정적 감사 시점에서 “신규 CRITICAL” 코드 결함은 추가 발견 없음.**  
이전에 수정된 항목: **`cancelDisbursement` → `payout_outbound` 차단 후 `reverse_disbursement` RPC 우회**(해결됨).

---

## SECTION 8 — 즉시 수정 필요 항목

**없음** (본 턴 코드 변경 없음; 기존 치명 우회는 이미 반영).

---

## SECTION 9 — 수정 보류 항목

- `reverse_disbursement` 레거시 제거(정책·DB 이행 후).
- `getDisbursementList` `type` NULL 구형 row UI(선택: 항상 서버 메시지 안내).
- KPI `PAY_FETCH_LIMIT` 상한 외 데이터 정책.
- **resturant_os** 주문 생성·RLS와의 **end-to-end** 재검증(별도 티켓).

---

## SECTION 10 — 현재 시스템 안정성 총평

관리자OS ERP 축(**주문·allocation·payable·payout·reversal·KPI**)은 **append-only·낙관적 잠금·부분 unique**로 상당 부분 방어되어 있다. **경계**(식당 앱 ↔ 플랫폼 DB ↔ 공급자 앱)는 **RLS·세션 tenant·repo 분리**에 달려 있어, **영업 전**에는 **AUTO에서 실주문 1건**으로 교차 검증을 권장한다. **잘 동작하는 핵심 구조는 변경하지 않는다**는 전제와 충돌하는 신규 이슈는 본 정적 감사에서 발견되지 않았다.

## 다음 권장 작업

- `resturant_os`에서 동일 주문 ID로 **비관리자** 주문·조회 API tenant 스코프 샘플 검증.
- `reverse_disbursement` 사용 로그 모니터링 후 제거 일정 확정.
