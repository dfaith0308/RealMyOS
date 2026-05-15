| 필드 | 값 |
|------|------|
| **상태** | 완료 |
| **완료일** | 2026-05-14 |

## 작업 목적

**OPS-UX-STABILITY-001**: 관리자OS ERP 화면에서 잘못된 버튼 노출·의미 혼동·연타를 줄여 운영 실수 가능성을 낮춘다. **Server Action 전이 규칙·append-only·KPI는 변경하지 않는다.**

## 관련 `tasks.md` ID

- **[OPS-UX-STABILITY-001]**

## 수정 파일 목록

- `src/actions/payment.ts` — `DisbursementListItem.type`, `getDisbursementList` select
- `src/components/disbursements/DisbursementsClient.tsx` — `payout_outbound` 취소 버튼 숨김·안내 문구
- `src/components/commerce/CommercePayablesClient.tsx` — 상태 한글·지급완료 `useTransition`
- `src/components/commerce/CommerceAllocationsClient.tsx` — 상태 한글·취소 버튼·모달 문구
- `src/components/commerce/OrdersClient.tsx` — paid 취소 모달·환불 안내
- `docs/tasks.md`

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` — pass (exit 0).

## 남은 위험

- `payments.type` 이 NULL인 구형 outbound는 취소 버튼이 다시 보일 수 있음(서버 차단은 별도).

## 다음 권장 작업

- 공급자OS·식당OS·영업·자동화 축으로 우선순위 이동.

---

## SECTION 1: 사전 확인 결과

1. **OrdersClient / OrderActions**  
   - `pending_payment`: 입금 확인·취소. `paid`: 준비 시작·취소 처리(모달). `refunded` 버튼은 **`cancelled && refund_required`** 일 때만.  
   - **paid → refunded 직접 버튼 없음.** `useTransition`으로 `pending` 시 버튼 `disabled`.  
   - 기존 paid 취소 모달은 짧은 문구만 있었음.

2. **CommercePayablesClient**  
   - 지급 완료 버튼은 **`r.status === 'unpaid'`** 일 때만. paid/cancelled는 `—`. 서버는 이미 paid 재처리 방어.

3. **CommerceAllocationsClient**  
   - pending: 확정. confirmed+미원장: 재시도. confirmed+unpaid payable: 「수동 역처리」. paid payable은 경고 문구만, 버튼 없음.

4. **DisbursementsClient**  
   - `pending` 이면 무조건 취소 버튼. **`type` 미조회**로 `payout_outbound` 구분 불가했음.

## SECTION 2: 작업별 수정 내용

| # | 내용 |
|---|------|
| 1 | `getDisbursementList`에 `type` 포함, UI에서 `payout_outbound` + pending 이면 취소 숨김·「수동 처리 필요」 |
| 2 | Payable 상태 열 한글화, 지급 완료 제출을 `useTransition`으로 연타 완화 |
| 3 | `paid` 행 아래 환불은 취소 후 진행 안내 문단 |
| 4 | 입금 확인 주문 취소 모달 문구·「돌아가기」「취소 진행」 |
| 5 | allocation 취소 버튼·모달 제목·본문·실행 버튼 라벨 정리 |
| 6 | allocation 행·탭·연결 원장 스냅샷 한글 라벨 |
| 7 | Payables 지급완료 모달·실행 경로 `markPending` |

## SECTION 3: 버튼 / badge 변경 목록

- Disbursements: pending + **非** payout_outbound 만 「취소」.  
- Payables: 상태 표시 `미지급` / `지급완료` / `취소됨`. 작업 열은 unpaid 만 버튼.  
- Allocations: 탭 `확정 대기` 등, 행 상태 한글, 액션 「지급 예정 취소 (수동)」.  
- Orders: paid 취소 모달 버튼 라벨 변경, paid 블록 하단 안내 문구.

## SECTION 4: 안내 문구 (요약)

- paid 환불: *환불 처리는 먼저 주문을 취소(cancelled)한 뒤…「환불 완료 처리」…*  
- paid 취소 모달: *입금 확인된 주문… reversal… payable… 계속 진행…*  
- allocation 취소 모달: *지급 예정 확정… payable cancelled… 실제 지급 완료 시 사용 금지… unpaid만…*  
- disbursement: *수동 처리 필요* (`payout_outbound` pending)

## SECTION 5: 중복 클릭 방지

- Orders·Allocations·Disbursements: 기존 `useTransition` 유지.  
- Payables 지급완료: **`useTransition` + `markPending`** 로 모달·실행 중 중복 클릭 완화.

## SECTION 6: 남은 운영 UX 리스크

- 구형 disbursement row에 `type` 없으면 취소 버튼이 보일 수 있음 → 서버에서 여전히 차단.  
- 주문 상세 패널 allocation `status` 원문 표시는 이번 범위 밖.

---

- **서버 전이 로직**: `updateCommerceOrderStatus` 등 **변경 없음** (조회 필드 `type` 추가만).  
- **append-only / migration / KPI 구조**: 유지·없음·미변경.

**OPS-UX-STABILITY-001**은 관리자OS ERP 운영 UX 안정화 **마지막 단계**에 해당하며, 이후 중심은 공급자OS / 식당OS / 영업 / 자동화로 이동 예정입니다.
