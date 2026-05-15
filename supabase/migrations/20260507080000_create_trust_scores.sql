-- DB-TODO-003: trust_scores (CONTEXT 정의 기준)
-- Note: migration file only. Do not execute without approval.

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

create index if not exists trust_scores_role_score_idx
  on public.trust_scores (role, score desc);

alter table public.trust_scores enable row level security;

-- Admin only access (CONTEXT: 관리자 전용)
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

