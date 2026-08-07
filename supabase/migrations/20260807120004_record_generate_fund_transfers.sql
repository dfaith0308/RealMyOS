-- RECORD-ONLY: dumped from prod (cqiwcyuclpuarynrreat) via pg_get_functiondef
-- Purpose: track function in git; already exists on prod — do not treat as pending apply
-- Function: public.generate_fund_transfers(p_tenant_id uuid, p_rows jsonb)
-- Captured: 2026-08-07
CREATE OR REPLACE FUNCTION public.generate_fund_transfers(p_tenant_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row          jsonb;
  v_count        integer := 0;
  v_date         date;
  v_prev_planned integer;
  v_prev_actual  integer;
  v_carry_over   integer;
  v_planned      integer;
begin
  -- DB KST 기준 오늘 날짜
  v_date := (current_timestamp at time zone 'Asia/Seoul')::date;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    -- 전일 미이행 carry_over 계산
    select
      coalesce(planned_amount, 0),
      coalesce(actual_amount,  0)
    into v_prev_planned, v_prev_actual
    from fund_transfers
    where tenant_id  = p_tenant_id
      and account_id = (v_row->>'account_id')::uuid
      and date       = v_date - interval '1 day'
    limit 1;

    -- 전일 없으면 0
    if not found then
      v_prev_planned := 0;
      v_prev_actual  := 0;
    end if;

    v_carry_over := greatest(0, v_prev_planned - v_prev_actual);
    v_planned    := coalesce((v_row->>'planned_amount')::integer, 0) + v_carry_over;

    insert into fund_transfers (
      tenant_id, date, account_id, rule_id,
      planned_amount, carry_over_amount, status
    ) values (
      p_tenant_id,
      v_date,
      (v_row->>'account_id')::uuid,
      nullif(v_row->>'rule_id', '')::uuid,
      v_planned,
      v_carry_over,
      'pending'
    )
    on conflict (tenant_id, account_id, date) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- Privileges as observed on prod (postgres owner grant omitted)
GRANT EXECUTE ON FUNCTION public.generate_fund_transfers(p_tenant_id uuid, p_rows jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.generate_fund_transfers(p_tenant_id uuid, p_rows jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_fund_transfers(p_tenant_id uuid, p_rows jsonb) TO service_role;
