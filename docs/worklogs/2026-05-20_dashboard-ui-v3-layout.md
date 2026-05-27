# 대시보드 UI v3 레이아웃 (KPI·수금·매출 분석)

## 작업 목적

PRODUCT 스펙에 맞춰 **대시보드 페이지 콘텐츠 영역만** 상단 KPI 2×2 + 수금 패널 + 하단 매출 분석(탭) 구조로 재구성한다.

## 관련 tasks.md ID

- `SUP-PARTIAL-001` (대시보드 블록)

## 수정 파일 목록

| 파일 | 역할 |
|------|------|
| `src/actions/dashboard.ts` | `avg_collection_speed_days`, `getDashboardSalesAnalysis()` |
| `src/app/(app)/dashboard/page.tsx` | 레이아웃·KPI·수금 패널 |
| `src/app/(app)/dashboard/dashboard.module.css` | 색상·그리드·카드 스타일 |
| `src/app/(app)/dashboard/DashboardSalesAnalysis.tsx` | 매출 분석 탭(client) |
| `src/components/order/OrdersClient.tsx` | 예치 표시 `deposit_amount` 연동(미수 0일 때) |

## 변경 내용 요약

- 상단: KPI 4종(미수·연체·이번달 매출·평균 수금 속도) + 우측 오늘 수금 패널(320px).
- 하단: 매출 분석 3열(거래처 TOP5·상품 TOP5·전기 대비 증가 TOP5), 탭 이번달/전월/3개월 — 서버에서 6개월 주문 1회 조회 후 기간별 집계.
- 기존 CommandStrip·DashboardQueueSection 제거(본 페이지 범위).
- 사이드바·`(app)/layout.tsx` 미변경.

## migration 여부

없음.

## 테스트 결과

- `npx tsc --noEmit` 통과.

## 남은 위험

- 작업 시 브랜치 `main` — 배포 전 `dev` 병합 확인 권장.
- `payment_allocations` 테이블 없음 — 증가율·수금 배정은 주문·입금 합산 기준만.
- `customer_deposits` 미존재 시 예치 KPI/표시는 0(기존과 동일).
- `DashboardSalesAnalysis.tsx`는 현재 대시보드 페이지에서 미사용이나, 타입체크에 포함되므로 import 타입 불일치/`.next` 산출물 영향으로 `tsc` 실패 가능. (본 로그에서는 `.next` 정리 후 통과 확인)

## 다음 권장 작업

- `dev`에서 UI 스모크 테스트.
- SUP-PARTIAL-001 잔여 블록(AI 인사이트·자금 상세 등) 필요 시 별도 카드로 복원 검토.
