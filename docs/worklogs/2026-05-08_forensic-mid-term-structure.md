## 작업 개요
- 목표: **데이터가 없어도** FORENSIC 중기 항목의 **구조(UI/액션/로그/테이블 연계)** 를 “완성 상태”로 구현한다.
- 범위:
  - **FORENSIC-004-C** 신뢰도 이력 추적
  - **FORENSIC-002-C** A/B 테스트 구조
  - **FORENSIC-003-C** Credit Line(신용한도) 구조
  - **FORENSIC-003-D** 자동 정산 제안 구조

---

## FORENSIC-004-C 신뢰도 이력 추적
### DB
- `trust_score_logs` 운영 DB 적용 완료(2026-05-08), admin-only RLS
- 소급 migration: `supabase/migrations/20260508060000_create_trust_score_logs.sql`

### 서버 액션
- `src/actions/admin/trust-engine.ts`
  - `syncTrustScoreFromRealData()`에서 score/level 변경 시 `trust_score_logs` INSERT
    - `reason='sync_from_real_data'`
    - `changed_by=null` (배치/시스템)
  - 조회용: `getTrustDetail()`, `getTrustScoreLogs()`

### UI
- 신규: `src/app/(admin)/participants/[id]/page.tsx`
  - 현재 점수/컴포넌트 + 이력 테이블
  - 이력 없으면: “신뢰도 배치 실행 후 이력이 쌓입니다” 안내
- 목록: `participants-client.tsx`에 상세 링크 추가

---

## FORENSIC-002-C A/B 테스트 구조
- `src/actions/admin/policy-console.ts`
  - `startExperiment()` → `admin_settings`에 키 저장:
    - `experiment_{name}_a`, `experiment_{name}_b`
    - `experiment_{name}_start`, `experiment_{name}_end` (선택)
  - `getExperiments()` → 현재 키를 묶어 목록 반환
  - 모두 `admin_logs` 기록
- UI:
  - 신규: `src/app/(admin)/policy/ExperimentsClient.tsx`
  - `src/app/(admin)/policy/page.tsx`에 섹션 추가
  - 데이터 없으면: “진행 중인 실험이 없습니다”

---

## FORENSIC-003-C Credit Line 구조
- `src/actions/admin/settlement-control.ts`
  - `getCreditLines()`:
    - 기본 공식: `trust_scores.score × 10,000원`
    - override: `admin_settings.credit_line_{tenant_id}`
  - `setCreditLineOverride()`는 구조/액션으로 준비(후속 UI 연결 가능)
- UI:
  - `src/app/(admin)/settlements/page.tsx`에 “신용한도 관리(구조)” 섹션 추가
  - 데이터 없으면: “신뢰도 배치 실행 후 신용한도가 계산됩니다”

---

## FORENSIC-003-D 자동 정산 제안 구조
- `src/actions/admin/settlement-control.ts`
  - `getAutoSettlementSuggestions()`:
    - 조건: `orders.status='confirmed'` + `settlement 미처리` + `30일 초과`
    - 자동 실행 금지 (UI에서 수동 `정산 처리` 버튼만 제공)
- UI:
  - `src/app/(admin)/settlements/page.tsx`에 “자동 정산 제안(구조)” 섹션 추가
  - 데이터 없으면: “정산 제안 항목이 없습니다”

---

## 검증
- `npx tsc --noEmit` 통과

