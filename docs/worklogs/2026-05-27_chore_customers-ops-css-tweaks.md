# Customers Ops List CSS tweaks (spacing/badges/CTA)

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-27 |
| **차단 사유** | 해당 없음 |

## 작업 목적

거래처 운영 목록 화면에서 “운영 판단 속도”를 유지하면서, 헤더-현황 띠의 리듬과 상태 인지(뱃지), CTA(수금 등록)의 가시성을 최소 변경으로 개선한다.

## 관련 tasks.md ID

- 없음 (OPS — AI worklog 항목으로 작업 이력만 추가)

## 수정 파일 목록

- `src/app/(app)/customers/customers-ops.module.css`
- `src/components/customer/CustomersOpsListClient.module.css`
- `src/components/customer/CustomersOpsListClient.tsx` (수금 버튼 className 최소 변경)

## 변경 내용 요약

- 헤더와 KPI(운영 현황) 띠 사이 간격을 `gap: 14px → 20px`로 확대해 상단 정보 블록 분리를 강화.
- 상태 뱃지의 높이/패딩/라운드/폰트 크기를 키우고, 유형별 테두리를 추가해 배경 대비를 강화.
- 수금 등록 버튼은 모든 행에서 항상 표시되도록 하고, 미수금 0원인 행은 버튼을 `opacity`로 dim 처리(hover 시 복원).

## migration 여부

- 없음

## 테스트 결과

- `npx tsc --noEmit` — pass

## 남은 위험

- 모바일(980px 이하)에서는 `.colAction`이 숨김 처리되어 있어, “항상 표시”는 데스크톱 레이아웃 기준이다(기존 동작 유지).

## 다음 권장 작업

- 고객 상태(연체/수금지연/신규/정상) 판별 기준 변경 시, 뱃지/행 강조 규칙과 CTA dim 규칙(미수 0원)을 함께 재검토.

