| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |

## 작업 목적

- **FORENSIC-009**의 원인(프록시 활동일·`.limit()` 샘플링·고정 기간)을 제거해, **대형 테넌트에서도 성장 지표가 왜곡되지 않도록** 한다.
- 기존 지표 정의/출력 형태는 유지하되, **정확도 개선을 우선**하고 성능은 **명시적 페이지네이션**으로 방어한다.

## 관련 문서 / 원칙

- `docs/FORENSIC.md` — D-018 정책키 소비 원칙(`admin_settings` → `getAdminSettingNumber` 폴백).
- `docs/tasks.md` — `FORENSIC-009` 종결 처리.

## 문제 요약 (수정 전)

1. **휴면 판별**이 `users.updated_at` 최대값을 로그인 프록시로 사용 → 실제 활동(연락/주문/발주)과 불일치 가능.
2. 여러 성장/휴면 집계 쿼리에 **`.limit()`**가 있어 대형 테넌트에서 **지표가 샘플링 왜곡**될 수 있음.
3. **이탈 위험 감지** 주문 스냅샷이 **최근 120일 고정**(+ limit) → 정책키와 무관한 근사치.

## 변경 내용

### 1) 휴면 판별 기준 개선 (실제 활동일)

- 기준을 `users.updated_at`에서 아래 3 신호로 교체했다.
  - `contact_logs.contacted_at` (마지막 활동일)
  - `orders.order_date` (마지막 주문일, confirmed)
  - `rfq_requests.created_at` (마지막 발주일)
- 위 3개 중 **가장 최근 날짜**를 활동일로 보고, **90일 이상 신호 없음**을 휴면으로 판정한다.
- UI 출력 필드(`DormantTenantRow`)는 호환을 위해 유지했다.
  - `last_login_at`: 마지막 `contact_logs` 활동일(표시용)
  - `last_trade_at`: 위 3 신호의 최종 활동일(표시용)

### 2) `.limit()` 제거 / 페이지네이션 적용

- 성장 지표 집계(orders/rfq/휴면 계산)는 `.limit()` 샘플링을 제거하고, `range(from, to)` 기반 **명시적 페이지네이션**으로 전체 데이터를 순회하도록 변경했다.
- 지표와 무관한 로그성 조회(`admin_logs` 신뢰도 급락 탐지)는 **폭주 방어 목적**으로 제한을 유지하고, **이유 주석**을 추가했다.

### 3) 이탈 위험 감지 기간 동적화

- `admin_settings.order_cycle_calculation_count`(정책키)을 사용해 이탈 감지 주문 스냅샷 기간을 동적으로 산정했다.
  - \(windowDays = \max(90, \min(365, order\_cycle\_calculation\_count \times 30))\)
  - 정책키 조회는 `getAdminSettingNumber`를 통해 **폴백(D-018)**을 준수한다.

## 수정 파일

- `src/actions/admin/growth-engine.ts`
- `docs/tasks.md`

## 테스트

- `npx tsc --noEmit`: 통과

## 리스크 / 메모

- 성장 엔진이 전체 데이터를 페이지네이션으로 순회하므로, **데이터가 매우 큰 환경**에서는 호출 시간이 늘어날 수 있다.
  - 단, 기존처럼 `.limit()`로 지표가 왜곡되는 것보다는 정확도가 우선이며, 추후 rollup/MV/SQL 집계로 최적화 가능하다.

