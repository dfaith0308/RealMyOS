# 2026-05-07 — SUP-MISSING-001 거래처 분류 시스템 구현

## 목표

- PRODUCT §6-3 “거래처 분류(Category/Value)” 시스템 구현
- 물리 삭제 금지(RULE-10) + 변경 이력 필수(customer_tag_logs)
- 화면: 거래처 상세(`/customers/[id]`)에서 분류 태그를 조회/추가/변경/비활성화

## DB 상태

- `customer_tags`, `customer_tag_logs` 테이블 **적용 완료**
- 본 작업은 **코드 연결 + UI 제공** 위주

## 구현 내용

### Server Actions (`src/actions/customer-tags.ts`)

- `getCustomerTags(customer_id)`
  - tenant_id 스코프 검증 후 active 태그 조회
- `upsertCustomerTag({ customer_id, category, value })`
  - active 태그가 있으면 update, 없으면 insert
  - 변경 시 `customer_tag_logs`에 create/update 기록
  - 로그 실패 시 상태 롤백(비활성화/값 되돌림)으로 “로그 필수”를 강제
- `deactivateCustomerTag(id)`
  - `is_active=false`로 soft deactivate
  - `customer_tag_logs`에 deactivate 기록
  - 로그 실패 시 활성 복구 롤백

### UI (`src/components/customer/CustomerTagsSectionClient.tsx`)

- 기본 분류 카테고리/값 프리셋 제공 + “직접 입력”
- 카테고리별 그룹 렌더
- 태그 추가/변경(Upsert) + 비활성화(soft)

## 변경 파일

- `src/actions/customer-tags.ts`
- `src/components/customer/CustomerTagsSectionClient.tsx`
- `src/components/customer/CustomerTagsSectionClient.module.css`
- `src/app/(app)/customers/[id]/page.tsx`
- `supabase/migrations/20260507140000_create_customer_tags.sql`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`

## 남은 문제 / 다음

- 고객 상세 페이지 자체가 아직 레거시 인라인 스타일 기반이라, 분류 섹션 외 영역도 운영 콘솔 DS로 점진적 정렬 필요
- 분류 변경 이력을 UI에 노출(최근 10개)하면 운영 추적성이 더 좋아짐

