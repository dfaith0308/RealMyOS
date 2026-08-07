-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.handle_new_user_onboarding()
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid;
begin
  -- 1. 이미 users 테이블에 있으면 스킵
  if exists (select 1 from users where id = new.id) then
    return new;
  end if;
 
  -- 2. tenant 자동 생성
  insert into tenants (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'company_name', '내 회사'),
    lower(regexp_replace(
      coalesce(new.raw_user_meta_data->>'company_name', 'company-' || substr(new.id::text, 1, 8)),
      '[^a-z0-9]+', '-', 'g'
    ))
  )
  returning id into v_tenant_id;
 
  -- 3. users 생성 (supplier role)
  insert into users (id, tenant_id, role, user_type, email)
  values (new.id, v_tenant_id, 'supplier', 'human', new.email)
  on conflict (id) do nothing;
 
  return new;
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.handle_new_user_onboarding() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_onboarding() TO service_role;
