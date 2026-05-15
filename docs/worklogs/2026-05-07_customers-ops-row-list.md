# 2026-05-07 Customers — 채권 운영 콘솔 Row List

## 목적
- Customers 목록을 “주소록/CRUD”가 아니라 **채권 운영 콘솔**로 재설계한다.
- 5초 안에 “누구부터 수금해야 하는지” 판단 가능해야 한다.
- 데이터 로직(`getCustomersWithScore`)과 DB 구조는 **수정하지 않는다**.

## 핵심 UX 변경
- **상단 CommandStrip**: `연체 N곳 · 총 미수 ₩X` + (수금 등록 / 연체 거래처 보기)
- **즉시 필터링**: 검색 입력(제출 버튼 없음) + FilterChips(전체/연체/위험/신규/정상)
- **운영 Row List**: 카드/테이블 헤더 제거
  - 행 클릭 → `/customers/[id]/ledger`
  - StatusBadge는 **overdue/warning/pending**만 사용
  - 신규/정상은 **텍스트 Tag**로만 표시(배지 남발 금지)
  - Row 액션 버튼은 **수금 등록 1개만**

## Row 정보 계층(스캔 순서)
1) 상태(배지) → 2) 미수금(가장 크게) → 3) 최소 근거(결제조건/최근 수금(7일)/연락) → 4) 수금 등록(1개)

## 변경 파일
### 신규
- `src/components/customer/CustomersOpsListClient.tsx`
- `src/components/customer/CustomersOpsListClient.module.css`
- `src/app/(app)/customers/customers-ops.module.css`

### 수정
- `src/app/(app)/customers/page.tsx` (CustomerCard 제거, ops list 적용)
- `src/components/dashboard/CommandStrip.tsx` (재사용 가능하도록 범용 props + Dashboard wrapper)
- `src/app/(app)/dashboard/page.tsx` (DashboardCommandStrip 사용)

## 검증
- `npx tsc --noEmit` 통과

## 남은 UX 문제 / 후속 제안
- “마지막 수금 D+N”은 현재 `getCustomersWithScore()` 데이터에 **last_payment_date가 없어** 대신 `최근 수금(7일) N회`로 대체함(데이터 로직 수정 금지 조건 준수). 후속으로 `getCustomersWithScore` 반환에 last_payment_date를 추가할지 검토 필요.
- 다음 추천 화면: `customers/[id]/ledger` 상단을 KPI/Queue 관점으로 정리(원장 스캔 속도 개선).

