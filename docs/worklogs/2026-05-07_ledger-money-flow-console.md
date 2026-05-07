# 2026-05-07 — Ledger 돈 흐름 콘솔 재설계

## 목표

- 거래처 원장(`/customers/[id]/ledger`)을 “거래 내역 표”가 아니라 **돈의 흐름**으로 보이게 재구성
- 사용자가 **3~5초 안에** “돈이 어디서 들어왔는지 / 미수가 어디서 쌓이는지 / 지금 위험한지”를 파악하도록 숫자 hierarchy를 재정렬

## 범위 (중요)

- **UI/구조/hierarchy만 변경**
- `getCustomerLedger()` / DB 구조 / 계산 로직: **수정 금지 준수**

## 변경 요약 (핵심 UX)

- **상단 채권 운영 헤더**: 거래처명 + Back + CTA(수금 등록/수금 내역)
- **KPI 스트립**: “현재 미수금”을 최상위(가장 크게)로, 숫자 대비/우측정렬/`tabular-nums` 강화
- **필터**: submit 제거, URL querystring 기반 즉시 반영(기간 preset chips + 결제수단 chips)
- **원장 리스트**: `<table>` 제거, `DataTableRow` 기반 row flow로 완전 전환
- **날짜 그룹**: sticky group header(날짜 + 매출/수금/subtotal + 순흐름)
- **기초잔액**: 리스트 최상단 고정 정보로 분리
- **보조 영역**: 세금계산서 요약 + 최근 행동 기록(7일)을 하단 `details`로 격리(원장 흐름을 주인공으로)

## 변경 파일

- `src/app/(app)/customers/[id]/ledger/page.tsx`
- `src/app/(app)/customers/[id]/ledger/ledger-flow.module.css`
- `src/components/ledger/CustomerLedgerFlowClient.tsx`
- `src/components/ledger/CustomerLedgerFlowClient.module.css`
- `src/components/ui/KPIBlock.tsx`
- `src/components/ui/KPIBlock.module.css`

## 테스트

- `npx tsc --noEmit`

## 리스크 / 남은 문제

- “위험” 상태 배지는 현재 `current_balance` 기반 단순 판정(연체 정의/위험 점수는 Phase 7 연체 시스템과 연결 필요)
- 날짜 그룹 sticky는 CSS `position: sticky` 기반으로, 스크롤 컨테이너 구조 변화 시 레이아웃 검증 필요

## 다음 추천

- `ledger`의 row 표현을 “판매/수금” 외에도 (취소/역분개/예치금/분배)로 확장할 수 있는 상태 언어 연결
- `last_payment_date`를 거래처 목록에도 SSOT로 제공(`SUP-MISSING-005`)하여 “D+N”을 전체 콘솔에서 일관화

