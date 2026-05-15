## 작업 개요
- 목표: `trust_scores`를 **실거래 데이터 기반으로 주기적으로 갱신**하고, 정책키로 갱신 주기를 제어한다.
- 근거: `docs/PRODUCT.md` §10-5 참여자/관계 네트워크 — 신뢰도는 수동 수정 금지, 행동 데이터 기반 자동 계산/정책 실행/Action Queue 연계.

---

## 변경 사항 요약
### 1) FORENSIC-004-B: 정책키 추가 (D-018)
- 파일: `src/lib/policy-setting-defaults.ts`
- 추가:
  - `trust_update_cycle_days`: 기본값 `7`, 설명 `신뢰도 갱신 주기 (일)`

### 2) FORENSIC-004-A: 실거래 데이터 기반 신뢰도 동기화 배치
- 파일: `src/actions/admin/trust-engine.ts`
- 추가:
  - `syncTrustScoreFromRealData(tenant_id)`
    - 테넌트 role(`supplier|restaurant`)을 조회한 뒤 해당 role의 `trust_scores`를 upsert
    - 갱신 후 점수/레벨 재계산 및 `admin_logs` 기록
  - `runTrustSyncBatch()`
    - 전체 테넌트(supplier/restaurant)를 순차 처리
    - `admin_settings.trust_update_cycle_days` 기준으로 **최근 갱신이 N일 이내면 스킵**
    - 배치 결과를 `admin_logs`에 기록

---

## 지표 계산 정의 (요구사항 반영)
- **delivery_rate**: `orders(status='confirmed')` 중 `order_status='납품완료'` 비율(%)  
- **payment_rate**: 이번달 `payments(status='confirmed', direction=...)` 합 / 이번달 발생 주문 금액 합(%)  
- **claim_count**: `contact_logs(outcome_type='claim')` 최근 90일 건수  
- **rfq_complete_rate**: `rfq_requests(status='closed')` 비율(%)  
- **repeat_trade_rate**: 최근 90일 내 2회 이상 주문한 거래처 수 / 전체 거래처 수(%)  

> NOTE: 데이터 소스는 PRODUCT §10-5의 “행동 데이터 기반 자동 계산” 원칙을 따르며, 현 단계에서는 운영 DB 스키마를 변경하지 않고 기존 테이블을 조합해 산출한다.

---

## UI 연결
- 파일: `src/app/(admin)/engine/page.tsx`
- 추가: **[신뢰도 배치 실행]** 버튼 → `runTrustSyncBatch()` 실행

---

## 검증
- `npx tsc --noEmit` 통과

