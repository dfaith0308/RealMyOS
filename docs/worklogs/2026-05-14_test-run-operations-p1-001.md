| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**TEST-RUN-OPERATIONS-P1-001**: 주문→결제→allocation→payable→payout→취소/refund 운영 리허설(runbook) 성격의 검증. **본 저장소 세션에서는 AUTO DB·브라우저에 연결하지 않고** 코드·migration·UI 정적 검증으로 PASS/FAIL 가능 영역을 판정하고, **치명 버그 1건**(`cancelDisbursement`가 `payout_outbound` 차단 후 legacy RPC로 우회 가능)을 최소 수정함.

## 관련 `tasks.md` ID

- **[TEST-RUN-OPERATIONS-P1-001]**
- 연계: **[REFUND-LIFECYCLE-P1-001]**, **[APPEND-ONLY-CONVERGENCE-P1-001]**, `docs/TEST-DEV/TEST-RUN-ERP-001.md`, `docs/TEST-RUN/TEST-RUN-MASTER-001.md`

## 수정 파일 목록

- `src/actions/payment.ts` — `PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR` 상수, `cancelDisbursement`에서 해당 오류 시 `reverse_disbursement` RPC 미호출
- `docs/tasks.md` — 본 ID 작업 이력
- `docs/worklogs/2026-05-14_test-run-operations-p1-001.md` — 본 파일

## 변경 내용 요약

- **치명**: `insertOutboundReversal`이 `payout_outbound`에서 실패 반환 후에도 `cancelDisbursement`가 `reverse_disbursement` RPC를 호출해 차단을 무력화할 수 있었음 → 차단 메시지와 일치할 때 즉시 `{ success: false, error }` 반환.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — **pass** (exit 0).
- 브라우저 `/buy`·관리자 UI·AUTO Supabase SQL: **미실행** (환경·자격 미제공). 아래 SECTION 1은 **코드/스키마 기준 예상** + 정적 UX 확인.

---

## SECTION 1: 시나리오별 PASS/FAIL (정적 검증 기준)

| 단계 | 판정 | 근거 |
|------|------|------|
| S1 STEP 1 storefront 무통장 주문 | **조건부 PASS** | `commerce_orders` 상태머신에 `pending_payment`·`payment_status` unpaid 경로 존재(실제 주문 생성은 UI·tenant 미검증). |
| S1 STEP 2 입금 확인 | **조건부 PASS** | `updateCommerceOrderStatus` 낙관적 잠금 `.eq('status', beforeStatus)`; `tryRecordPlatformReceivablePayment` 멱등 + `payments_commerce_order_id_primary_unique`(reversal_of_id null)로 이중 inbound 방지; 23505 시 무시. |
| S1 STEP 3 allocation | **조건부 PASS** | `createCommerceOrderAllocations`: fee·`supplier_payable_amount` 합계 검증, 음수 시 실패. |
| S1 STEP 4 allocation 확정·payable | **조건부 PASS** | `confirmCommerceAllocation` → `supplier_payables` 멱등(`commerce_order_allocation_id`). |
| S1 STEP 5 payout | **조건부 PASS** | `markSupplierPayableAsPaid`: `type=payout_outbound`, payable `unpaid`→`paid` + outbound insert, 실패 시 payable 롤백. |
| S1 STEP 6 KPI | **조건부 PASS** | `getStorefrontRevenueKPI`는 플랫폼 payee inbound만 집계; 시나리오 1은 reversal 없음 가정 시 gross 증가. **원시 SQL**(문서 STEP 6)은 `payee_tenant_id` 미필터 → KPI UI와 다를 수 있음 → **일반(문서)** 기록. |
| S2 STEP 7 paid 취소 | **조건부 PASS** | `processCommerceOrderCancelledAccountingP0`: inbound append-only reversal, pending allocation cancelled, unpaid payable cancelled, paid는 로그. |
| S2 STEP 8 KPI 취소 | **조건부 PASS** | gross 원본 유지 + reversal row 집계로 net 감소 구조. |
| S2 STEP 9 payout_outbound 취소 차단 | **코드상 PASS (수정 후)** | 차단 메시지 + 감사 RPC; **수정 전**에는 STEP 9 **FAIL** 가능(legacy RPC 우회). |
| S3 STEP 10 입금 연타 | **조건부 PASS** | 주문 상태 이중 전이 실패 + DB unique로 이중 inbound 방지. |

## SECTION 2: 발견된 버그 목록

| 등급 | 내용 |
|------|------|
| **치명** | `cancelDisbursement`: `payout_outbound`에서 `insertOutboundReversal` 실패 후에도 `reverse_disbursement` RPC 호출 가능 → 차단 무력화·append-only 위반 위험. |
| **일반** | 운영 리허설 SQL STEP 6이 플랫폼 payee 스코프 없이 전역 SUM → KPI 카드와 숫자 불일치 가능. |
| **UX** | `DisbursementsClient`: `pending` outbound 전부 「취소」 노출, `payout_outbound` 구분 없음(서버에서 차단·오류 표시). |
| **UX** | `OrdersClient`: `useTransition`으로 연타 완화되나 이중 클릭 레이스는 DB unique가 최종 방어. |

## SECTION 3: 즉시 수정한 항목

- `cancelDisbursement`: `append.error === PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR`이면 legacy RPC 호출 없이 실패 반환; `insertOutboundReversal`은 동일 상수로 오류 문자열 반환.

## SECTION 4: 수정 보류 항목

- STEP 6용 SQL을 `getStorefrontRevenueKPI`와 동일 스코프로 맞추는 것 → **문서/가이드** 성격(`TEST-RUN-ERP-001` 등) 후속.
- Disbursements UI에서 `payout_outbound` 취소 버튼 숨김 → 범위 밖 UX 개선으로 보류.

## SECTION 5: KPI 최종 숫자 검증

- **미실행**: AUTO 대시보드·SQL 집계 수치는 기록하지 않음. 코드상 gross/net/reversal 정의는 `platform-revenue.ts` 및 `TEST-RUN-ERP-001`과 정합.

## SECTION 6: 운영 UX 위험 포인트 결과

1. 입금 확인 연타: `pending` 비활성 + 상태 낙관적 잠금 + unique — **완화됨**.  
2. payable paid 재처리: UI는 `unpaid`만 「지급 완료」; 서버는 `paid` 시 멱등 또는 오류 — **완화됨**.  
3. cancelled 주문 입금: `pending_payment`→`paid`만 허용, cancelled에서 paid 전이 없음 — **차단**.  
4. paid payable 취소 버튼: payables 목록에 별도 취소 버튼 없음(할당 화면 등 별도 경로는 본 검증 범위 밖).  
5. payout_outbound 취소 버튼: **노출됨**(pending 전부); 서버 **차단(수정 후 RPC 우회 없음)**.

## SECTION 7: append-only semantics 검증 결과

- storefront inbound reversal: INSERT만, 원본 confirmed 유지(`commerce-reversal.ts`).  
- outbound reversal: INSERT 상쇅 row; `payout_outbound`는 INSERT+legacy RPC 모두 금지(수정 후 `cancelDisbursement` 경로 포함).  
- allocation 취소: UPDATE status(비금액)·DELETE 없음.  
- `markSupplierPayableAsPaid`: payable UPDATE + payout INSERT(append); 실패 시 payable 되돌림.

## 다음 권장 작업

- 테스트 테넌트·`TEST-RUN-P1-` 접두로 AUTO에서 문서 STEP SQL을 실제 실행·스크린샷 보관.  
- `docs/TEST-DEV/TEST-RUN-ERP-001.md` STEP 예시 SQL에 `payee_tenant_id` 필터 선택적 추가 검토.
