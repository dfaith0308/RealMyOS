'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

export type ActionQueuePriority = 'critical' | 'high' | 'today' | 'normal'
export type ActionQueueStatus = 'pending' | 'in_progress' | 'completed' | 'expired'
export type ActionQueueCategory = 'trust' | 'trade' | 'settlement' | 'policy' | 'direct_trade'

export interface ActionQueueItem {
  id: string
  priority: ActionQueuePriority
  category: ActionQueueCategory
  title: string
  description: string | null
  status: ActionQueueStatus
  action_options: any | null
  target_tenant_id: string | null
  expires_at: string | null
  escalated_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

async function insertAdminLog(supabase: any, input: {
  admin_id: string
  action_type: string
  tenant_id?: string | null
  reason?: string | null
  target_table?: string | null
  target_id?: string | null
  old_value?: any
  new_value?: any
}) {
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
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

function priorityRank(p: ActionQueuePriority): number {
  return p === 'critical' ? 0 : p === 'high' ? 1 : p === 'today' ? 2 : 3
}

export async function getActionQueue(filter?: {
  category?: ActionQueueCategory
  priority?: ActionQueuePriority
}): Promise<ActionResult<ActionQueueItem[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let q = supabase
    .from('action_queue')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter?.category) q = q.eq('category', filter.category)
  if (filter?.priority) q = q.eq('priority', filter.priority)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const rows = (data ?? []) as ActionQueueItem[]
  rows.sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority)
    if (pr !== 0) return pr
    return String(b.created_at).localeCompare(String(a.created_at))
  })

  // 조회 로그는 best-effort
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'action_queue_view',
    target_table: 'action_queue',
  }).catch(() => {})

  return { success: true, data: rows }
}

// NOTE: Action Queue는 시스템만 생성한다 (D-016). 관리자 수동 생성 금지.
export async function createActionQueueItem(): Promise<ActionResult> {
  return { success: false, error: 'Action Queue 항목은 시스템만 생성합니다.' }
}

export async function resolveActionQueueItem(
  id: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!id?.trim()) return { success: false, error: 'id가 올바르지 않습니다.' }

  const { data: before } = await supabase
    .from('action_queue')
    .select('id, status, resolved_at, resolved_by')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('action_queue')
    .update({
      status: 'completed',
      resolved_by: auth.ctx.user_id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'action_queue_resolve',
    target_table: 'action_queue',
    target_id: id,
    old_value: before ?? null,
    new_value: { status: 'completed' },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true }
}

export async function expireStaleItems(): Promise<ActionResult<{ expired_count: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const { data: stale, error: selErr } = await supabase
    .from('action_queue')
    .select('id, priority, status, created_at')
    .in('status', ['pending', 'in_progress'])
    .lt('created_at', threshold)
    .limit(500)

  if (selErr) return { success: false, error: selErr.message }

  const ids = (stale ?? []).map((r: any) => r.id).filter(Boolean)
  if (ids.length === 0) return { success: true, data: { expired_count: 0 } }

  const { error } = await supabase
    .from('action_queue')
    .update({
      status: 'expired',
      priority: 'critical',     // expired → critical 자동 승격
      escalated_at: new Date().toISOString(),
    })
    .in('id', ids)

  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'action_queue_expire_stale',
    target_table: 'action_queue',
    reason: `expired ${ids.length} stale items (72h)`,
    new_value: { expired_ids: ids },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true, data: { expired_count: ids.length } }
}

