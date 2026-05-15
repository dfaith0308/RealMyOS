-- DB-TODO-001: settings_logs (PRODUCT 6-14)
-- Note: migration file only. Do not execute without approval.

create table if not exists public.settings_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists settings_logs_tenant_changed_at_idx
  on public.settings_logs (tenant_id, changed_at desc);

alter table public.settings_logs enable row level security;

-- Tenant scoped access (or admin)
drop policy if exists "settings_logs_select_tenant" on public.settings_logs;
create policy "settings_logs_select_tenant"
  on public.settings_logs
  for select
  using (tenant_id = get_my_tenant_id() or is_admin());

drop policy if exists "settings_logs_insert_tenant" on public.settings_logs;
create policy "settings_logs_insert_tenant"
  on public.settings_logs
  for insert
  with check (tenant_id = get_my_tenant_id() or is_admin());

