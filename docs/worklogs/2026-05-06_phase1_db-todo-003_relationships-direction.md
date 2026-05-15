# Phase 1 — DB-TODO-003 (tenant_relationships) 방향 확정: 별도 테이블 신설

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-06 |
| **차단 사유** | 해당 없음 |

## 작업 목적

운영 DB forensic로 실존이 확인된 `tenant_relationships`와, PRODUCT §8-6 / CONTEXT의 신뢰도(`trust_scores`) 정의를 대조해 **GAP을 문서화**하고, Phase 6에서의 migration 방향(테이블 신설 vs 기존 확장)을 확정한다.  
이번 작업은 **코드 수정/DB 적용/migration 파일 생성 없이 문서로만** 결론을 고정한다.

## 관련 tasks.md ID

- DB-TODO-003

## 수정 파일 목록

- `docs/tasks.md`
- `docs/worklogs/2026-05-06_phase1_db-todo-003_relationships-direction.md`

## 기준 문서에서 확인한 요구사항(발췌 요약)

- **PRODUCT §8-6**: `relationships (식당-공급자 연결)`을 별도 테이블로 전제하고, 식당OS 사용 필드로 `rating / memo / last_signal_at / signal_suppressed_until` 등을 명시하며, “relationships 테이블 (최종 통합 정의)”에서 필드 목록을 고정한다.
- **CONTEXT**: 관리자 레이어의 핵심 테이블로 `trust_scores`를 별도 테이블로 정의한다. (`tenant_id`, `role`, `score`, `level`, 각종 rate, `violation_count`, `cooldown_until`, `updated_at` 등)

## 운영 DB tenant_relationships(forensic) 기준 현행 컬럼(대조 기준)

`tasks.md`의 forensic 요약 기준:

- `requester_tenant_id`
- `target_tenant_id`
- `status`
- `memo`
- `connected_at`
- `created_at`
- `updated_at`

## GAP 목록

### PRODUCT(relationships) 요구인데 tenant_relationships에 없음

- `restaurant_tenant_id`, `supplier_tenant_id` (현행은 requester/target으로 역할이 고정되지 않음)
- `trust_score`
- `relationship_status` (현행 `status`가 대체 가능한지 여부는 본 작업에서 확정 불가)
- `rating`
- `last_signal_at`
- `signal_suppressed_until`
- `cooldown_until`
- (PRODUCT 정의 상) `created_at` 외 관계 신호/쿨다운 관련 필드 다수

### CONTEXT(trust_scores) 요구인데 tenant_relationships로 대체 불가

- `trust_scores`는 “테넌트 전체 신뢰도” 구조로, 관계(relationship) 이력/요청 테이블과 목적이 다르며 다음 필드를 요구한다:
  - `tenant_id`, `role`, `score`, `level`, `delivery_rate`, `payment_rate`, `rfq_complete_rate`, `repeat_trade_rate`, `violation_count`, `cooldown_until`, `updated_at` 등

### 재활용 가능 후보(단정 금지)

- `memo`: PRODUCT의 관계 메모와 의도가 유사할 수 있음
- `requester_tenant_id`/`target_tenant_id`: 관계 양 끝 tenant를 나타내지만, requester/target이 restaurant/supplier로 고정되는지까지는 본 작업 범위에서 확정 불가

## 방향 A/B 비교 근거

### 방향 A — tenant_relationships에 컬럼 추가(확장)

- 장점: 기존 테이블 1개로 수렴 가능
- 단점(문서 정의 관점):
  - `tenant_relationships`의 축(요청/연결 이력)과 PRODUCT가 고정한 `relationships`(관계 신호/평가/쿨다운) 축이 달라, 한 테이블에 혼재될 위험이 큼
  - CONTEXT의 `trust_scores`는 관계가 아니라 테넌트 전체 신뢰도이므로 `tenant_relationships` 확장으로는 정합이 어렵고, 결국 별도 테이블이 필요해짐

### 방향 B — 별도 테이블 신설(분리)

- 장점(문서 정의 정합):
  - PRODUCT가 “relationships 테이블 (최종 통합 정의)”로 별도 테이블과 필드 집합을 고정
  - CONTEXT가 `trust_scores`를 관리자 레이어의 별도 테이블로 고정 정의
  - 관계 요청/연결 이력(`tenant_relationships`)과 관계 신호/평가(`relationships`)와 테넌트 전체 신뢰도(`trust_scores`)를 분리해 목적과 책임이 명확
- 단점: Phase 6에서 migration 2개(relationships/trust_scores) 신설 작업이 필요

## 최종 결정 (승인 반영)

- **방향 B 확정**
  - `tenant_relationships`: 현행 유지 (관계 요청/연결 이력)
  - `relationships`: PRODUCT §8-6 기준 신설 (Phase 6)
  - `trust_scores`: CONTEXT 기준 신설 (Phase 6)
- **migration 파일 생성 시점**: Phase 6(`ADM-TODO-001`) 진입 시에만 생성 (Phase 1에서는 생성 금지)

## migration 여부

- 없음 (방향 확정만)

## 테스트 결과

- 미실행 — 문서 작업만

## 남은 위험

- `tenant_relationships`가 실데이터에서 requester/target 역할이 어떻게 쓰이는지에 따라, Phase 6에서 `relationships`로의 backfill/이행 전략이 달라질 수 있음.

## 다음 권장 작업

- Phase 6에서 관리자OS 착수 시, `relationships`/`trust_scores` migration 설계 및 RLS(tenant/admin) 정책을 CONTEXT 권한 구조와 함께 확정한다.

