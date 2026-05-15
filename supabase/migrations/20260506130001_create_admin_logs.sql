-- DB-TODO-002: admin_logs (PRODUCT §10)
-- Note: migration file only. Do not execute without approval.

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_tenant_id uuid not null,
  action_type text not null,
  target_tenant_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_logs_admin_created_at_idx
  on public.admin_logs (admin_tenant_id, created_at desc);

alter table public.admin_logs enable row level security;

-- Admin only access
drop policy if exists "admin_logs_select_admin" on public.admin_logs;
create policy "admin_logs_select_admin"
  on public.admin_logs
  for select
  using (is_admin());

drop policy if exists "admin_logs_insert_admin" on public.admin_logs;
create policy "admin_logs_insert_admin"
  on public.admin_logs
  for insert
  with check (is_admin());

