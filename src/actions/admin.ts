'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type AdminDashboardData = {
  counts: {
    total: number
    approved: number
    pendingApproval: number
  }
  recentTenants: Array<{
    id: string
    name: string | null
    role: string | null
    is_approved: boolean | null
    created_at: string | null
  }>
  recentAdminLogs: Array<{
    id: string
    admin_id: string | null
    tenant_id: string | null
    action_type: string | null
    created_at: string | null
  }>
}

type TenantRow = {
  id: string
  name: string | null
  role: string | null
  is_approved: boolean | null
  created_at: string | null
}

type AdminLogRow = {
  id: string
  admin_id: string | null
  tenant_id: string | null
  action_type: string | null
  reason?: string | null
  created_at: string | null
}

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

async function insertAdminLog(
  supabase: any,
  input: {
    admin_id: string
    tenant_id?: string | null
    action_type: string
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: any
    new_value?: any
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  // NOTE: DB-TODO-002 맥락상 admin_logs 테이블이 없을 수 있음.
  // 원칙상 “관리자 액션은 로그 기록 필수”이므로, write 액션에서는 실패를 상위로 전파한다.
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAdminDashboard(): Promise<
  { success: true; data: AdminDashboardData } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const [{ data: tenants, error: tenantsErr }, logsRes] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, name, role, is_approved, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('admin_logs')
      .select('id, admin_id, tenant_id, action_type, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (tenantsErr) return { success: false, error: tenantsErr.message }

  const safeTenants = (tenants ?? []) as AdminDashboardData['recentTenants']

  const total = safeTenants.length
  const approved = safeTenants.filter((t) => t.is_approved === true).length
  const pendingApproval = safeTenants.filter((t) => t.is_approved !== true).length

  const recentTenants = safeTenants.slice(0, 20)

  // admin_logs는 운영 DB에 없을 수 있음 (DB-TODO-002) → best-effort
  const recentAdminLogs = (logsRes.error ? [] : ((logsRes.data ?? []) as AdminDashboardData['recentAdminLogs']))

  return {
    success: true,
    data: {
      counts: { total, approved, pendingApproval },
      recentTenants,
      recentAdminLogs,
    },
  }
}

export async function getTenantList(): Promise<
  { success: true; data: { tenants: TenantRow[] } } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, role, is_approved, created_at')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  // 조회 로그는 best-effort (화면 진입 자체를 막지 않음)
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'tenants_list_view',
    reason: 'admin tenants list view',
    target_table: 'tenants',
  }).catch(() => {})

  return { success: true, data: { tenants: (data ?? []) as TenantRow[] } }
}

export async function approveTenant(tenant_id: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const { data: before } = await supabase
    .from('tenants')
    .select('id, is_approved')
    .eq('id', tenant_id)
    .maybeSingle()

  const { error } = await supabase
    .from('tenants')
    .update({ is_approved: true })
    .eq('id', tenant_id)

  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id,
    action_type: 'tenant_approve',
    reason: 'approve tenant',
    target_table: 'tenants',
    target_id: tenant_id,
    old_value: { is_approved: (before as any)?.is_approved ?? null },
    new_value: { is_approved: true },
  })

  if (!logRes.ok) {
    // 로그 기록이 실패하면 원칙상 액션도 실패로 간주 → 롤백 시도
    await supabase.from('tenants').update({ is_approved: (before as any)?.is_approved ?? false }).eq('id', tenant_id)
    return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  return { success: true }
}

export async function suspendTenant(tenant_id: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const { data: before } = await supabase
    .from('tenants')
    .select('id, is_approved')
    .eq('id', tenant_id)
    .maybeSingle()

  const { error } = await supabase
    .from('tenants')
    .update({ is_approved: false })
    .eq('id', tenant_id)

  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id,
    action_type: 'tenant_suspend',
    reason: 'suspend tenant',
    target_table: 'tenants',
    target_id: tenant_id,
    old_value: { is_approved: (before as any)?.is_approved ?? null },
    new_value: { is_approved: false },
  })

  if (!logRes.ok) {
    await supabase.from('tenants').update({ is_approved: (before as any)?.is_approved ?? false }).eq('id', tenant_id)
    return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  return { success: true }
}

export async function getAdminLogs(input?: { action_type?: string | null }): Promise<
  { success: true; data: { logs: AdminLogRow[] } } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let q = supabase
    .from('admin_logs')
    .select('id, admin_id, tenant_id, action_type, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (input?.action_type) q = q.eq('action_type', input.action_type)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: { logs: (data ?? []) as AdminLogRow[] } }
}

