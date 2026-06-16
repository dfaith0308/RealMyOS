'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
  representative_name: string | null
  contact_phone: string | null
  subscription_plan: string | null
  subscribed_at: string | null
  plan_expires_at: string | null
}

export type TenantAdminRow = TenantRow & {
  email: string | null
  user_id: string | null
}

export type TenantDetailRow = {
  id: string
  name: string
  role: string
  is_approved: boolean
  created_at: string
  email: string | null
  user_id: string | null
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

async function createSupabaseAdmin(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin 환경변수가 설정되지 않았습니다')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function slugBaseFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
  return base || 'tenant'
}

async function insertTenantWithSlug(
  admin: SupabaseClient,
  input: { name: string; role: 'supplier' | 'restaurant' },
): Promise<{ id: string } | { error: string }> {
  const base = slugBaseFromName(input.name)
  const ts = Date.now().toString(36)

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? `${base}-${ts}` : `${base}-${ts}-${attempt}`
    const { data, error } = await admin
      .from('tenants')
      .insert({
        name: input.name,
        slug,
        role: input.role,
        is_approved: true,
      })
      .select('id')
      .single()

    if (!error && data) return { id: data.id }

    const msg = error?.message ?? ''
    const isDup =
      error?.code === '23505' ||
      msg.toLowerCase().includes('duplicate') ||
      msg.toLowerCase().includes('unique')
    if (!isDup) return { error: msg || 'tenant 생성 실패' }
  }

  return { error: 'slug 중복으로 tenant 생성에 실패했습니다.' }
}

async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId)
}

async function deleteTenantRow(admin: SupabaseClient, tenantId: string): Promise<void> {
  await admin.from('tenants').delete().eq('id', tenantId)
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

export async function getTenantAdminList(): Promise<
  { success: true; data: { tenants: TenantAdminRow[] } } | { success: false; error: string }
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = await createSupabaseAdmin()

  const { data: tenants, error: tenantsErr } = await admin
    .from('tenants')
    .select('id, name, role, is_approved, created_at, representative_name, contact_phone, subscription_plan, subscribed_at, plan_expires_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (tenantsErr) return { success: false, error: tenantsErr.message }

  const rows = (tenants ?? []) as TenantRow[]
  const tenantIds = rows.map((t) => t.id)

  if (tenantIds.length === 0) {
    return { success: true, data: { tenants: [] } }
  }

  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, tenant_id')
    .in('tenant_id', tenantIds)

  if (usersErr) return { success: false, error: usersErr.message }

  const userByTenant = new Map<string, { id: string }>()
  for (const u of users ?? []) {
    const tid = (u as { tenant_id: string | null }).tenant_id
    const uid = (u as { id: string }).id
    if (tid) userByTenant.set(tid, { id: uid })
  }

  const enriched: TenantAdminRow[] = []
  for (const t of rows) {
    const linked = userByTenant.get(t.id)
    let email: string | null = null
    if (linked?.id) {
      const { data: authUser } = await admin.auth.admin.getUserById(linked.id)
      email = authUser?.user?.email ?? null
    }
    enriched.push({
      ...t,
      user_id: linked?.id ?? null,
      email,
    })
  }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'tenants_list_view',
    reason: 'admin tenants list view',
    target_table: 'tenants',
  }).catch(() => {})

  return { success: true, data: { tenants: enriched } }
}

export async function getTenantDetail(input: {
  tenant_id: string
}): Promise<ActionResult<TenantDetailRow>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const tenant_id = input.tenant_id?.trim()
  if (!tenant_id) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const admin = await createSupabaseAdmin()

  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .select('id, name, role, is_approved, created_at')
    .eq('id', tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (tenantErr) return { success: false, error: tenantErr.message }
  if (!tenant) return { success: false, error: '테넌트를 찾을 수 없습니다.' }

  const { data: userRow } = await admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  const user_id = (userRow as { id: string } | null)?.id ?? null
  let email: string | null = null
  if (user_id) {
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user_id)
    if (authErr) return { success: false, error: authErr.message }
    email = authUser?.user?.email ?? null
  }

  return {
    success: true,
    data: {
      id: tenant.id,
      name: tenant.name ?? '',
      role: tenant.role ?? '',
      is_approved: tenant.is_approved === true,
      created_at: tenant.created_at ?? '',
      email,
      user_id,
    },
  }
}

export async function createTenant(input: {
  email: string
  password: string
  name: string
  role: 'supplier' | 'restaurant'
}): Promise<ActionResult<{ tenant_id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const email = input.email.trim()
  const name = input.name.trim()
  if (!email || !name) return { success: false, error: '이메일과 상호명을 입력해주세요.' }
  if (!input.password || input.password.length < 8) {
    return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (input.role !== 'supplier' && input.role !== 'restaurant') {
    return { success: false, error: '역할이 올바르지 않습니다.' }
  }

  const admin = await createSupabaseAdmin()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { role: input.role },
  })

  if (authErr || !authData.user) {
    return { success: false, error: authErr?.message ?? 'Auth 사용자 생성 실패' }
  }

  const userId = authData.user.id

  const tenantRes = await insertTenantWithSlug(admin, { name, role: input.role })
  if ('error' in tenantRes) {
    await deleteAuthUser(admin, userId)
    return { success: false, error: tenantRes.error }
  }

  const tenantId = tenantRes.id

  const { error: userErr } = await admin.from('users').insert({
    id: userId,
    tenant_id: tenantId,
    role: input.role,
    user_type: 'human',
    email,
  })

  if (userErr) {
    await deleteTenantRow(admin, tenantId)
    await deleteAuthUser(admin, userId)
    return { success: false, error: userErr.message }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: tenantId,
    action_type: 'tenant_create',
    reason: 'admin create tenant',
    target_table: 'tenants',
    target_id: tenantId,
    new_value: { email, name, role: input.role },
  })

  if (!logRes.ok) {
    await admin.from('users').delete().eq('id', userId)
    await deleteTenantRow(admin, tenantId)
    await deleteAuthUser(admin, userId)
    return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  return { success: true, data: { tenant_id: tenantId } }
}

export async function updateTenant(input: {
  tenant_id: string
  name?: string
  email?: string
  password?: string
}): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const tenant_id = input.tenant_id?.trim()
  if (!tenant_id) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const admin = await createSupabaseAdmin()

  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (tenantErr) return { success: false, error: tenantErr.message }
  if (!tenant) return { success: false, error: '테넌트를 찾을 수 없습니다.' }

  const { data: userRow, error: userRowErr } = await admin
    .from('users')
    .select('id, email')
    .eq('tenant_id', tenant_id)
    .maybeSingle()

  if (userRowErr) return { success: false, error: userRowErr.message }
  if (!userRow?.id) return { success: false, error: '연결된 사용자를 찾을 수 없습니다.' }

  const userId = userRow.id as string
  const old_value: Record<string, unknown> = {
    name: tenant.name,
    email: (userRow as { email?: string | null }).email ?? null,
  }
  const new_value: Record<string, unknown> = {}
  let changed = false

  if (input.name?.trim() && input.name.trim() !== (tenant.name ?? '')) {
    const { error } = await admin.from('tenants').update({ name: input.name.trim() }).eq('id', tenant_id)
    if (error) return { success: false, error: error.message }
    new_value.name = input.name.trim()
    changed = true
  }

  const authUpdates: { email?: string; password?: string } = {}
  if (input.email?.trim()) authUpdates.email = input.email.trim()
  if (input.password?.trim()) {
    if (input.password.length < 8) {
      return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' }
    }
    authUpdates.password = input.password
  }

  if (Object.keys(authUpdates).length > 0) {
    const { error: authUpdateErr } = await admin.auth.admin.updateUserById(userId, authUpdates)
    if (authUpdateErr) return { success: false, error: authUpdateErr.message }
    if (authUpdates.email) {
      new_value.email = authUpdates.email
      const { error: emailRowErr } = await admin
        .from('users')
        .update({ email: authUpdates.email })
        .eq('id', userId)
      if (emailRowErr) return { success: false, error: emailRowErr.message }
    }
    if (authUpdates.password) new_value.password_changed = true
    changed = true
  }

  if (!changed) return { success: false, error: '변경할 내용이 없습니다.' }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id,
    action_type: 'tenant_update',
    reason: 'admin update tenant',
    target_table: 'tenants',
    target_id: tenant_id,
    old_value,
    new_value,
  })

  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true }
}

export async function deleteTenant(input: {
  tenant_id: string
}): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const tenant_id = input.tenant_id?.trim()
  if (!tenant_id) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const { data: before, error: beforeErr } = await supabase
    .from('tenants')
    .select('id, is_approved, deleted_at')
    .eq('id', tenant_id)
    .maybeSingle()

  if (beforeErr) return { success: false, error: beforeErr.message }
  if (!before) return { success: false, error: '테넌트를 찾을 수 없습니다.' }
  if ((before as { deleted_at?: string | null }).deleted_at) {
    return { success: false, error: '이미 삭제된 계정입니다.' }
  }

  const deleted_at = new Date().toISOString()
  const { error } = await supabase
    .from('tenants')
    .update({ is_approved: false, deleted_at })
    .eq('id', tenant_id)

  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id,
    action_type: 'tenant_delete',
    reason: 'admin soft delete tenant',
    target_table: 'tenants',
    target_id: tenant_id,
    old_value: {
      is_approved: (before as any)?.is_approved ?? null,
      deleted_at: (before as any)?.deleted_at ?? null,
    },
    new_value: { is_approved: false, deleted_at },
  })

  if (!logRes.ok) {
    await supabase
      .from('tenants')
      .update({
        is_approved: (before as any)?.is_approved ?? false,
        deleted_at: (before as any)?.deleted_at ?? null,
      })
      .eq('id', tenant_id)
    return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  return { success: true }
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

