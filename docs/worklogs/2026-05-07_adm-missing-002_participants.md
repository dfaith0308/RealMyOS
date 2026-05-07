# ADM-MISSING-002 참여자/관계 네트워크

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-08 |
| **차단 사유** |  |

## 작업 목적

- PRODUCT §10-5 정의에 맞춰 `trust_scores` 기반의 참여자 상태(Level)와 `relationships` 기반의 관계 신뢰도를 관리자OS에서 조회/실행 가능하게 연결한다.
- 신뢰도 점수의 **수동 수정은 금지**하고(점수는 행동 기반 자동 계산), 관리자는 “재계산/적용”으로만 개입하며 모든 행동은 `admin_logs`로 기록한다.
- Level 3 진입 시 Action Queue(Critical)로 연결해 “점수 → 통제 실행” 흐름을 만든다.

## 관련 tasks.md ID

- `ADM-MISSING-002`

## 수정 파일 목록

- `src/actions/admin/trust-engine.ts`
- `src/app/(admin)/participants/page.tsx`
- `src/app/(admin)/participants/participants-client.tsx`
- `src/app/(admin)/participants/relationships/page.tsx`
- `src/app/(admin)/participants/relationships/relationships-client.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `docs/tasks.md`

## 변경 내용 요약

- **신뢰도 계산 엔진**
  - `calculateTrustScore(tenant_id, role)`: `trust_scores` 구성 요소 컬럼을 기반으로 score/level을 재계산(드라이런)
  - `updateTrustScore(tenant_id, role)`: score/level 업데이트 + `admin_logs` 필수 기록
  - Level 3(공급자 ≤50 / 식당 ≤40) 진입 시 `action_queue`에 `category='trust'`, `priority='critical'` 자동 생성(best-effort 중복 방지)
- **참여자 네트워크 화면**
  - `/admin/participants`: 역할/Level/점수 구간 필터, Level 색상 표시, 재계산/적용 버튼 제공
- **관계 네트워크 화면**
  - `/admin/participants/relationships`: 식당↔공급자 관계 목록, status/점수 구간 필터, trust_score 배지 표시
- **사이드바 연결**
  - `/admin/participants` 메뉴 추가

## migration 여부

- 없음 (DB 테이블 `trust_scores`, `relationships` 기 존재)

## 테스트 결과

- `npx tsc --noEmit`: PASS

## 남은 위험

- PRODUCT에 명시된 원천 데이터 소스(`orders/payments/claims/delivery_logs/bid_participation`)로부터의 정교한 자동 계산은 후속 작업 필요.
  - 현재 구현은 `trust_scores` 테이블의 구성 요소 컬럼을 기반으로 score를 재계산하는 형태(MVP)이다.
- Level 임계값은 PRODUCT에서 `admin_settings`로 정책화가 원칙이나, 현재는 PRODUCT 확정값으로 하드코딩(후속에서 settings 연동 필요).

## 다음 권장 작업

- `admin_settings`에서 임계값/쿨다운/가중 제재(escallation) 파라미터를 읽어 Level 매핑을 정책화(하드코딩 제거).
- 관계 기반 신뢰도(relationships.trust_score)가 RFQ 노출/추천(노출 감소/입찰 제한) 로직에 실제로 반영되도록 정책/실험 콘솔과 연결.

