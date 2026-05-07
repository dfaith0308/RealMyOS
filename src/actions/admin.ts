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

export async function getAdminDashboard(): Promise<
  { success: true; data: AdminDashboardData } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { success: false, error: '권한 없음' }

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

