# 2026-05-07 — 거래처 등록 폼 정리 + 분류 시스템 재구성 (PRODUCT §6-3)

## 목표

- PRODUCT §6-3 “거래처 등록” 정의를 100% 따르도록 등록 폼을 정리
- 거래처 분류(Category/Value)는 하드코딩 금지 → `customer_tag_options` 기반으로 동적 구성
- 분류 옵션은 관리자가 추가/수정/비활성화 가능하도록 설정 화면 제공
- RULE-01(tenant)·RULE-10(물리 삭제 금지) 준수, 분류 변경 이력은 `customer_tag_logs`로 기록

## DB 상태

- `customer_tags`, `customer_tag_logs` 적용 완료
- `customer_tag_options` 운영 DB 생성 완료 + 저장소 migration 소급 생성

## 구현 내용

### 1) migration 소급 생성

- `supabase/migrations/20260507170000_create_customer_tag_options.sql`
  - `customer_tag_options` 테이블 + RLS 정책 + 인덱스

### 2) 분류 옵션 액션

- `src/actions/customer-tag-options.ts`
  - `seedDefaultOptions()` : tenant 최초 1회 기본 카테고리/옵션 시드
  - `getTagOptions(category?)` : 활성 옵션 조회(sort_order ASC)
  - `addTagOption/updateTagOption/deactivateTagOption`
  - `addTagCategory/deactivateTagCategory`

### 3) 거래처 등록 폼 정리

- `src/components/customer/CustomerCreateForm.tsx`
  - 등록 폼에서 분류/유입/연락상태/역할/목표매출 입력 제거
  - 사업자 유형일 때 사업자 전용 필드만 조건부 노출
  - 사업자번호 입력 시 하이픈 제거 + 숫자만 저장(중복 체크 유지)
  - 최초 미수금 입력 안내 강화(등록 후 변경은 이력 기반)

- `src/actions/customer.ts`
  - create/update input에서 분류 관련 필드 제거
  - `phone` 필수화
  - 사업자번호 정규화 + 서버 단 중복 차단
  - opening_balance 입력 시 `opening_balance_logs` 기록 유지

### 4) 거래처 상세 분류 섹션 동적화

- `src/components/customer/CustomerTagsSectionClient.tsx`
  - 하드코딩 제거
  - `customer_tag_options` 기반으로 카테고리/옵션을 동적 렌더
  - 카테고리당 1개 선택(클릭으로 upsert, 재클릭으로 deactivate)
  - 우상단에 `⚙️ 분류 관리` 링크(`/settings/tags`) 추가

### 5) 분류 관리 설정 화면

- `src/app/(app)/settings/tags/page.tsx`
- `src/components/settings/TagOptionsManagerClient.tsx`
  - 카테고리/옵션 추가·수정·비활성화(UI는 최소, 데이터는 SSOT)

## 테스트

- `npx tsc --noEmit`

