# ADM-MISSING-005,006 성장·정산 MVP

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

PRODUCT §10-8 성장/영업 엔진과 §10-9 수익/정산 통제를 관리자OS에서 조회·실행할 수 있는 MVP로 연결한다. 이탈·휴면 신호는 규칙 기반으로 Action Queue에 적재하고, 플랫폼 수수료 정산은 관리자 버튼 확인 후 `payments`에만 기록한다.

## 관련 `tasks.md` ID

- ADM-MISSING-005
- ADM-MISSING-006

## 수정 파일 목록

- `src/actions/admin/growth-engine.ts` (신규)
- `src/actions/admin/settlement-control.ts` (신규)
- `src/app/(admin)/growth/page.tsx` (신규)
- `src/app/(admin)/growth/actions.ts` (신규)
- `src/app/(admin)/settlements/page.tsx` (신규)
- `src/app/(admin)/settlements/SettleOrderButton.tsx` (신규)
- `src/components/layout/AdminSidebar.tsx`
- `docs/DECISIONS.md` ([D-017] 추가)
- `docs/tasks.md`

## 변경 내용 요약

- 성장: 최근 120일 확정 주문으로 거래처 단위 이탈 신호(30일 무주문·전월 대비 빈도 감소)·`admin_logs.trust_update` 기반 신뢰 10점 이상 하락을 수집하고, 휴면은 테넌트별 로그인 추정(`users.updated_at`)과 주문/RFQ 마지막 일자로 판단한다.
- `/admin/growth`: KPI 카드·6개월 GMV 막대·목록·폼으로 `detectChurnRisk` / `detectDormant` 실행(SERVER ACTION).
- 정산: `admin_settings`에 `platform_fee_rate`·`settlement_cycle_days` 없으면 INSERT 시드 후 값만으로 수수료율·위험 일수를 계산한다(D-017).
- `processSettlement`: 수동 확인 후 `payments`에 `type=settlement`, `admin_logs`, 관련 `action_queue`(action_options.order_id 일치) 완료 처리.
- 사이드바에 `/admin/growth`, `/admin/settlements` 링크 추가.

## migration 여부

없음 (코드만 — 기존 운영 DB에 `payments.type`, `admin_settings` 등이 있다는 전제).

## 테스트 결과

- `npx tsc --noEmit` — 통과 (realmyos).

## 남은 위험

- `payments.type`, 일부 `payments` INSERT 컬럼(RLS 포함)이 운영 스키마와 다르면 정산 INSERT 실패 가능.
- 휴면·로그인 신호는 `users.updated_at` 근사이며, 전 플랫폼 주문 스캔 상한(쿼리 limit)으로 일부 대형 테넌트만 표시될 수 있음.
- D-016과 화면 버튼의 관계: 버튼은 고정 규칙 서버 액션만 호출하며 임의 큐 생성은 금지한다.

## 다음 권장 작업

- 운영 `payments` 정본 컬럼에 맞춘 INSERT 검증·실패 시 명확한 에러 메시지.
- 정산 대상 주문 범위·페이지네이션·선지급(Credit Line) 등 PRODUCT §10-9 확장 범위 별도 설계.
