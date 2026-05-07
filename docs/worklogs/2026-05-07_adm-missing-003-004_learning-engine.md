# ADM-MISSING-003, ADM-MISSING-004 데이터 학습 센터 + 판단/분석 엔진

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |
| **차단 사유** |  |

## 작업 목적

- PRODUCT §10-6 “데이터 학습 센터”의 MVP 단계(규칙 기반 자동 판단)에서 요구하는 **학습 단계/전환 달성률/자동화율/개입률** 지표를 관리자OS에서 확인할 수 있게 한다.
- PRODUCT §10-7 “판단/분석 엔진”의 MVP로서 위험 감지(신뢰도/거래/정산)를 **Action Queue로 라우팅**하고, 관리자는 결과를 실행(또는 예외 처리)하는 구조를 만든다.

## 관련 tasks.md ID

- `ADM-MISSING-003`
- `ADM-MISSING-004`

## 수정 파일 목록

- `src/actions/admin/learning-center.ts`
- `src/actions/admin/analysis-engine.ts`
- `src/app/(admin)/learning/page.tsx`
- `src/app/(admin)/engine/page.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- **데이터 학습 센터 (MVP)**
  - `collectPlatformStats()`: orders(confirmed) / tenants / trust_scores 참여자 수 / action_queue 상태 기반 지표 수집
  - `getLearningStatus()`: 단계(MVP/중기/후기) 및 MVP→중기 전환 조건(orders 500+, 참여자 50+, 정확도 70%+)의 달성률 산출
  - `/admin/learning`: 현재 단계 + 전환 달성률(프로그레스) + 핵심 지표 표시
- **판단/분석 엔진 (MVP)**
  - `runAnalysisEngine()`: 신뢰도 위험(Level2+) + trade-monitor anomaly를 기반으로 Action Queue 항목 생성(best-effort 중복 방지)
  - `getRiskSummary()`: Level2+ 참여자 수, 미처리 Action Queue 수, 오늘 감지 건수 등 요약 제공
  - `/admin/engine`: [분석 실행] 버튼 + 위험 요약 카드 + 최근 Action Queue 목록 표시
- **사이드바 연결**
  - `학습센터(/admin/learning)`, `분석엔진(/admin/engine)` 메뉴 추가

## migration 여부

- 없음 (기존 `action_queue/admin_logs/admin_settings/trust_scores` 활용)

## 테스트 결과

- `npx tsc --noEmit`: PASS

## 남은 위험

- “자동 판단 정확도/오버라이드 비율”은 오탐 전용 기록 테이블이 없어서 `action_queue` 상태를 이용한 **Proxy 지표**로 계산한다(정확도 측정 고도화 필요).
- 직거래 감지, 비정상 금액 거래 등 PRODUCT에 있는 일부 판단 항목은 “미래 구현” 상태로 0건 처리된다.

## 다음 권장 작업

- 오탐 처리([오탐으로 처리]) 및 오탐률/미탐률 측정을 위한 기록 스키마(`error_logs` 또는 판단 결과 로그)를 추가하고 Learning Center 지표를 SSOT로 개선.
- 중기 단계의 시장 가격 분포/패턴 인텔리전스를 위한 데이터 수집 파이프라인(품목별 가격 분포, 덤핑 감지 등)을 점진적으로 확장.

