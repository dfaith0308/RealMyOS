# SUP-PARTIAL-002-B/C/D 견적현황/전송이력/전환 UX

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |
| **차단 사유** |  |

## 작업 목적

- PRODUCT §6-5 정의에 맞춰 `/quotes` 견적현황을 “현황/전환/만료” 관점으로 바로 실행 가능한 형태로 정합한다.
- 견적 전달(다운로드/공유) 행동을 `quote_logs`에 남겨 이후 영업/전환 분석의 근거를 만든다.
- 견적 품목을 선택/수량 지정한 뒤 주문등록 화면으로 이어지게 해서, 견적→주문 전환을 “작성 흐름”으로 정리한다.

## 관련 tasks.md ID

- `SUP-PARTIAL-002-B`
- `SUP-PARTIAL-002-C`
- `SUP-PARTIAL-002-D`

## 수정 파일 목록

- `supabase/migrations/20260507230000_add_quotes_fields.sql`
- `src/types/quote.ts`
- `src/actions/quote.ts`
- `src/app/(app)/orders/new/page.tsx`
- `src/components/order/OrderCreateForm.tsx`
- `src/types/order.ts`
- `src/actions/order.ts`
- `src/app/(app)/quotes/[id]/page.tsx`
- `src/app/(app)/orders/quotes/QuoteDetailClient.tsx`
- `src/app/(app)/orders/quotes/QuoteListClient.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- **[SUP-PARTIAL-002-B] 견적현황 5탭**
  - `/quotes` 목록에 탭(전체/전환 필요/유효기간 임박/부분 전환/만료) 추가
  - 견적 목록 컬럼을 PRODUCT 정의에 맞게 확장: 견적번호/거래처명/견적일/유효기간/총금액/전환율/상태/담당자
  - 전환율은 `quote_items`의 `converted_quantity ÷ quantity`를 런타임 집계로 계산(RULE-02)
- **[SUP-PARTIAL-002-C] 공유 버튼 + 전송 이력**
  - 견적 상세에서 `[카카오 공유]`/`[문자 공유]` 클릭 시 견적 링크를 클립보드 복사
  - 위 행동을 `quote_logs`에 `action='sent'`로 기록하고, 상세 하단에 “전송 이력” 표로 노출
  - PDF/JPG 다운로드 버튼 클릭 시에도 `sent(pdf)`로 1회 기록(best-effort)
- **[SUP-PARTIAL-002-D] 견적→주문 전환 UX**
  - 견적 상세에서 미전환 품목 체크+전환수량 입력 후, 주문등록 화면(`/orders/new`)으로 이동하면서 선택 품목을 자동 입력
  - 주문이 `confirmed`로 저장될 때 `convert_quote_items` RPC를 호출해 `converted_quantity`/상태 전이를 best-effort로 반영

## migration 여부

- 파일 추가(미적용) — `supabase/migrations/20260507230000_add_quotes_fields.sql`

## 테스트 결과

- `npx tsc --noEmit` 통과

## 남은 위험

- 기존 데이터에 `quote_date`/`quote_number`/`quote_items.tenant_id`가 일부 누락된 경우(운영 DB 상태에 따라) 목록 표시/집계가 불완전할 수 있음.
- PDF/JPG 다운로드는 기존 `quote-export` 로깅(`action='exported'`)과 이번 `sent(pdf)`가 함께 남을 수 있음(중복 관측 가능).

## 다음 권장 작업

- `quote_items.tenant_id`가 운영 DB에서 NULL인 레코드가 있다면 백필 migration/스크립트를 별도 작업으로 추가.
- “전환 필요/리마인드/추가 제안/재견적” 버튼을 실제 영업 실행(스크립트 선택/문자 발송) 플로우와 더 강하게 연결(예: `/sales/exec`에서 해당 거래처 프리셀렉트).

