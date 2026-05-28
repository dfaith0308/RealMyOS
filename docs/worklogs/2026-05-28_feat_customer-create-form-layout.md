# Customers — 거래처 등록 폼 레이아웃 개선 + 운영 분류 입력 연결

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-28 |
| **차단 사유** | 해당 없음 |

## 작업 목적

거래처 등록 화면을 “운영 입력 화면”으로 재정렬하여, 입력 속도·가독성·현장 사용성을 높인다. 우측 도움말 패널을 제거하고 섹션을 카드로 분리하며, 하단 저장 버튼을 Sticky로 고정한다.

## 관련 tasks.md ID

- 없음 (OPS — AI worklog 이력으로만 기록)

## 수정 파일 목록

- `src/actions/customer.ts`
- `src/app/(app)/customers/new/page.tsx`
- `src/components/customer/CustomerCreateForm.tsx`
- `src/components/customer/CustomerCreateForm.module.css` (신규)
- `docs/tasks.md`
- `docs/worklogs/2026-05-28_feat_customer-create-form-layout.md`

## 변경 내용 요약

- 거래처 등록 폼을 단일 컬럼 집중형 레이아웃으로 변경하고, 3개 카드(기본 정보/운영 분류/거래 조건)로 분리.
- 하단 CTA를 Sticky footer로 고정하여 긴 폼에서도 “저장/취소” 접근성을 유지.
- 유입경로(acquisition channel) 선택/직접 추가 및 목표 월매출 입력을 createCustomer 입력으로 연결.
- `CustomerInput`에 `acquisition_channel_id`, `target_monthly_revenue`를 추가하고 `createCustomer.insert`에 반영(다른 필드명/구조 유지).
- `/customers/new` 페이지에서 wrapper inline style을 제거하고, 레이아웃은 폼 컴포넌트가 책임지도록 위임.

## migration 여부

- 없음 (migration 신규 생성 금지 준수)

## 테스트 결과

- `npx tsc --noEmit` — pass
- `npm run build` — pass

## 남은 위험

- Sticky footer의 `left: 200px`는 사이드바 폭에 의존한다(모바일에서는 left:0으로 처리).
- DB 컬럼은 실제 사용 경로(`customer-query.ts` SELECT) 기준으로 존재 확인 후 연결했다(본 작업에서 migration은 추가하지 않음).

## 다음 권장 작업

- 등록 후 `/customers` 리스트에서 `trade_status`, `acquisition_channel_id`, `target_monthly_revenue`가 운영 화면에 노출/필터로 사용되는지 점검.
- `acquisition_channel` 직접 추가 시 중복 채널명 정책(대소문자/공백/비활성 포함) 필요하면 별 작업으로 정의.

