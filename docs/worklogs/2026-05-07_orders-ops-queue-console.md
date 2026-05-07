# 2026-05-07 — Orders 운영 Queue 콘솔 재설계

## 목표

- `/orders`를 “ERP 주문 테이블”이 아니라 **주문 처리 흐름 운영(Queue 콘솔)**로 재설계
- 사용자가 **5초 안에** “지금 어떤 주문을 먼저 처리해야 하는지”를 판단하도록 hierarchy를 재정렬

## 범위 (중요)

- **UI/구조/hierarchy만 변경**
- `getOrderList()` / DB 구조 / 주문 상태 로직 / 계산 로직: **수정 금지 준수**

## 핵심 UX 변경

- 상단 **CommandStrip**: “오늘 처리할 주문 {N}건” 선언 + CTA(주문 등록, Draft 보기)
- **KPI 스트립**: 처리 필요(draft) 최상위(가장 크게) + StatusBadge 1개만 + 오늘/진행/확정매출
- **필터**: submit/검색 버튼 제거, URL querystring 기반 **즉시 반영**
  - 상태 chips(전체/처리 필요/진행/취소/오늘)
  - 거래처 select(즉시 반영)
  - 기간 preset(이번달/최근7일/직접)
- **리스트**: `<table>` 완전 제거 → `DataTableRow` 기반 운영 row list로 전환
- **날짜 그룹**: sticky group header(날짜/건수/금액 합계)로 “오늘 주문 흐름”이 보이도록 구성
- **행 액션 축소**: 기본 액션은 `열기` 1개(`/orders/[id]`), 수정/취소 전면 배치 제거

## 변경 파일

- `src/app/(app)/orders/page.tsx`
- `src/app/(app)/orders/orders-ops.module.css`
- `src/components/order/OrdersClient.tsx`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`

## 남은 문제 / 다음

- 출고/납품 등 “진행 단계” 세분화는 현재 스키마 상태값만으로 표현 한계가 있음(Phase 7+ 상태 모델 정합 필요)
- `/orders/loading.tsx`는 아직 레거시 skeleton(인라인/테이블 전제)이라 후속 정렬 권장

