## 작업 개요
- 목표: 정책/실험 콘솔에서 **저장 전 충돌 경고**와 **영향 범위 미리보기**를 제공한다.
- 근거: `docs/PRODUCT.md` §10-10 — 정책은 실행(Trigger Routing)로 이어져야 하며, 관리자 개입/판단은 `admin_logs`에 남아야 한다.

---

## 구현 내용
### 1) FORENSIC-002-A 정책 충돌 감지 (경고 전용)
- 파일: `src/actions/admin/policy-console.ts`
- 추가: `checkPolicyConflict(key, newValue)`
  - 충돌 규칙:
    - `rfq_open_duration_hours < delivery_signal_window`
    - `trust_supplier_level3 > trust_supplier_level2`
    - `trust_supplier_level2 > trust_supplier_level1`
    - `settlement_cycle_days < 7`
    - `order_cycle_calculation_count < 2`
  - 반환: `{ hasConflict, message }` (저장 차단 없음, 경고만)
  - `admin_logs` 기록: `policy_conflict_check`

### 2) FORENSIC-002-B 정책 변경 영향 범위 표시 (저장 전 미리보기)
- 파일: `src/actions/admin/policy-console.ts`
- 추가: `getPolicyImpactPreview(key, newValue)`
  - 키별 영향 범위(카운트):
    - `trust_supplier_level1/2/3`: 현재 해당 `level`인 공급자 수 (`trust_scores`)
    - `rfq_open_duration_hours`: 진행 중 RFQ 수 (`rfq_requests.status='open'`)
    - `order_cycle_calculation_count`: 주문이력 있는 거래처 수 (`customer_stats` row count)
    - `signal_suppression_days`: 대기 중 영업 스케줄 수 (`sales_schedules.status='pending'`)
  - `admin_logs` 기록: `policy_impact_preview`

### 3) 정책 콘솔 UI 연동
- 파일: `src/app/(admin)/policy/PolicyConsoleClient.tsx`
- 저장(확인 모달) 오픈 시:
  - `checkPolicyConflict` 호출 결과를 **경고 텍스트**로 표시 (저장 차단 없음)
  - `getPolicyImpactPreview` 결과를 **영향 범위 문구**로 표시

---

## 검증
- `npx tsc --noEmit` 통과

