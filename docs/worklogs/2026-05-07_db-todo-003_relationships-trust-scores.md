# DB-TODO-003 — relationships + trust_scores 운영 DB 적용

| 필드 | 값 |
|------|-----|
| **상태** | 완료 |
| **완료일** | 2026-05-07 |
| **차단 사유** | 해당 없음 |

## 작업 목적

PRODUCT/CONTEXT 기준으로 관계·신뢰도 데이터의 SSOT 테이블을 신설하고, 운영 DB에 적용한 사실을 추적 가능하게 남긴다.

## 관련 tasks.md ID

- `DB-TODO-003`

## 수정 파일 목록

- `supabase/migrations/20260507070000_create_relationships.sql`
- `supabase/migrations/20260507080000_create_trust_scores.sql`
- `docs/tasks.md`

## 변경 내용 요약

- **relationships** 테이블 신설 (PRODUCT §8-6 / PRODUCT §9 “relationships 최종 통합 정의” 기준)
- **trust_scores** 테이블 신설 (CONTEXT `trust_scores` 정의 기준)
- 두 테이블 모두 **RLS 정책 포함**

## migration 여부

- migration: **production 적용 완료**
  - `supabase/migrations/20260507070000_create_relationships.sql` (relationships ✅)
  - `supabase/migrations/20260507080000_create_trust_scores.sql` (trust_scores ✅)

## DB 적용 완료 (운영)

- relationships 테이블 생성 ✅
- trust_scores 테이블 생성 ✅

## 스키마 / RLS 정책 (SQL)

### 1) relationships

```sql
create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  restaurant_tenant_id uuid not null references public.tenants(id),
  supplier_tenant_id uuid not null references public.tenants(id),
  trust_score integer not null default 100,
  relationship_status text not null default 'active'
    check (relationship_status in ('active', 'inactive', 'cooldown')),
  rating integer check (rating between 1 and 5),
  memo text,
  last_signal_at timestamptz,
  signal_suppressed_until date,
  cooldown_until date,
  created_at timestamptz not null default now()
);

create unique index if not exists relationships_restaurant_supplier_uidx
  on public.relationships (restaurant_tenant_id, supplier_tenant_id);

alter table public.relationships enable row level security;

drop policy if exists "relationships_select_participant" on public.relationships;
create policy "relationships_select_participant"
  on public.relationships
  for select
  using (
    restaurant_tenant_id = get_my_tenant_id()
    or supplier_tenant_id = get_my_tenant_id()
    or is_admin()
  );

drop policy if exists "relationships_write_participant" on public.relationships;
create policy "relationships_write_participant"
  on public.relationships
  for all
  using (
    restaurant_tenant_id = get_my_tenant_id()
    or supplier_tenant_id = get_my_tenant_id()
    or is_admin()
  )
  with check (
    restaurant_tenant_id = get_my_tenant_id()
    or supplier_tenant_id = get_my_tenant_id()
    or is_admin()
  );
```

### 2) trust_scores

```sql
create table if not exists public.trust_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  role text not null check (role in ('supplier', 'restaurant')),
  score integer not null default 100,
  delivery_rate numeric,
  claim_count integer default 0,
  payment_rate numeric,
  rfq_complete_rate numeric,
  repeat_trade_rate numeric,
  level integer not null default 1 check (level in (1, 2, 3)),
  cooldown_until date,
  violation_count integer default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists trust_scores_tenant_role_uidx
  on public.trust_scores (tenant_id, role);

alter table public.trust_scores enable row level security;

drop policy if exists "trust_scores_select_admin" on public.trust_scores;
create policy "trust_scores_select_admin"
  on public.trust_scores
  for select
  using (is_admin());

drop policy if exists "trust_scores_write_admin" on public.trust_scores;
create policy "trust_scores_write_admin"
  on public.trust_scores
  for all
  using (is_admin())
  with check (is_admin());
```

## 테스트 결과

- 미실행 (DB 적용 완료로 보고됨; 로컬/CI 타입체크는 본 작업 범위에 포함하지 않음)

## 남은 위험

- `relationships.trust_score`(관계 단위)와 `trust_scores.score`(테넌트 단위)의 **이중 구조**를 어떻게 계산/동기화할지(정책/실험 콘솔) 후속 설계 필요.

## 다음 권장 작업

- 관리자OS에서 `trust_scores` 관제/Action Queue 연동을 구현하고, score 변경 시 `admin_logs` 기록을 강제한다.

