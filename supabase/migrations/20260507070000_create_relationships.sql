-- DB-TODO-003: relationships (PRODUCT §8-6 / §9 최종 통합 정의)
-- Note: migration file only. Do not execute without approval.

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

create index if not exists relationships_restaurant_created_at_idx
  on public.relationships (restaurant_tenant_id, created_at desc);

create index if not exists relationships_supplier_created_at_idx
  on public.relationships (supplier_tenant_id, created_at desc);

alter table public.relationships enable row level security;

-- Tenant scoped access (or admin)
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

