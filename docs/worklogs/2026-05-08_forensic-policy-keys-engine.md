| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

`admin_settings`의 영업·RFQ·관제 정책 숫자 키 5종을 실제 엔진에 연결하고, `FORENSIC.md`·`DECISIONS.md`(D-018)로 고정한다.

## 관련 `tasks.md` ID

없음 — FORENSIC §4·운영 신뢰(D-018).

## 수정 파일 목록

**realmyos**: `policy-console.ts` (`getAdminSettingNumber`), `ledger.ts`, `sales.ts`, `sales-trigger.ts`, `trade-monitor.ts`, `docs/FORENSIC.md`, `docs/DECISIONS.md`, `docs/tasks.md`

**resturant_os**: `src/lib/admin-settings-read.ts`, `src/actions/rfq.ts`

## 변경 내용 요약

- `order_cycle_calculation_count` → `getCustomersWithBalance` 주문일 슬라이스·`getSalesTargets` 평균 주기
- `signal_suppression_days` → 정기관리 트리거 재연락 간격
- `delivery_signal_window`·`rfq_open_duration_hours` → 거래 관제 이상 감지 임계
- `rfq_repeat_limit`·`rfq_open_duration_hours` → 식당OS RFQ 생성 반복 제한·기본 마감·윈도우

## migration 여부

없음.

## 테스트 결과

`npx tsc --noEmit` — realmyos, resturant_os 각각 통과.

## 남은 위험

`delivery_signal_window` 기본값 5일로 지급 미정산 감지가 과거 하드코드 30일 대비 민감해짐 — 운영에서 정책값 조정 필요할 수 있음.

## 다음 권장 작업

`방치` 30일 트리거 등 나머지 하드코드 정책화·`admin_logs` 스키마와 INSERT 정합 재점검.
