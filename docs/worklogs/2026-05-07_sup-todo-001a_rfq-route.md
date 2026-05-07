# SUP-TODO-001-A — RFQ 공급자OS 라우트·기본 목록

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |

## 작업 목적

공급자OS에서 발주요청(RFQ)을 탐색할 수 있는 진입점을 마련한다. 운영 DB에 `rfq_requests`·`rfq_bids` 및 `supplier_tenant_id`·RLS가 확인된 전제에서, 마이그레이션 없이 앱 레이어만 추가한다.

## 관련 `tasks.md` ID

- `SUP-TODO-001-A` (부모: `SUP-TODO-001`)

## 수정 파일 목록

- `src/actions/rfq.ts` (신규)
- `src/app/(app)/rfq/page.tsx` (신규)
- `src/components/rfq/RfqHubClient.tsx` (신규)
- `src/components/layout/Sidebar.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- **`getSupplierRfqs`**: `rfq_requests`에서 `status = open` 단일 조회, `getAuthCtx`로 테넌트 확보(RULE-01). 컬럼은 요구된 목록만 선택.
- **`getMyBids`**: `rfq_bids`에서 `supplier_tenant_id = ctx.tenant_id`, `rfq_requests` 임베드 단일 쿼리. PostgREST가 관계를 배열로 줄 수 있어 클라이언트에서 단일 객체로 정규화.
- **`/rfq`**: 서버에서 두 액션 병렬 호출 후, 클라이언트 탭(발주요청 / 내 입찰)으로 표 형태 렌더.
- **Sidebar**: `발주요청` → `/rfq` 링크 추가.

## migration 여부

없음 (운영 스키마·RLS는 사용자 제공 정보 기준, 저장소에 migration 추가 없음).

## 테스트 결과

- `npx tsc --noEmit` — 통과 (로컬).

## 남은 위험

- **`rfq_requests.tenant_isolation`**: 발주요청 탭은 RLS상 “내 buyer 테넌트의 RFQ”만 보일 수 있어, 타 테넌트 오픈 마켓 목록은 **노출 정책·RLS 보완(SUP-TODO-001-B 등)** 전까지 비어 있을 수 있음.
- **`getMyBids`의 `rfq_requests` 임베드**: buyer RFQ에 대한 SELECT가 막히면 중첩 필드가 비어 UI는 `rfq_id` 프리픽스로 폴백.
- 상세 페이지·입찰 액션·알림은 미구현(`SUP-TODO-001-C`~`E`).

## 다음 권장 작업

- `SUP-TODO-001-B`: 단계별 노출 및 RLS/쿼리 정합.
- `SUP-TODO-001-C`: `/rfq/[id]` 및 입찰 생성·상태 전이.
