'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type ActionResult<T> = { success: boolean; data?: T; error?: string }

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

async function insertAdminLog(supabase: any, input: {
  admin_id: string
  action_type: string
  reason?: string | null
  target_table?: string | null
  new_value?: any
}) {
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: input.admin_id,
    tenant_id: null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export type LearningStage = 'MVP' | '중기' | '후기'

export interface PlatformStats {
  confirmed_orders: number
  total_tenants: number
  trust_participants: number
  action_queue_total: number
  action_queue_completed: number
  action_queue_expired: number
  admin_intervention_rate: number   // 0~100 (best-effort proxy)
  policy_automation_rate: number    // 0~100 (best-effort proxy)
  auto_judgement_accuracy: number   // 0~100 (best-effort proxy)
}

function pct(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

function stageFromStats(s: PlatformStats): LearningStage {
  // 요청 명세 + PRODUCT 기준(주요 전환)
  const mvpToMidOk =
    s.confirmed_orders >= 500 &&
    s.trust_participants >= 50 &&
    s.auto_judgement_accuracy >= 70
  if (mvpToMidOk) return '중기'
  return 'MVP'
}

export async function collectPlatformStats(): Promise<ActionResult<PlatformStats>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const [
    { count: confirmed_orders, error: oErr },
    { count: total_tenants, error: tErr },
    { data: trustRows, error: trErr },
    { count: aqTotal, error: aqErr },
    { count: aqCompleted, error: aqCErr },
    { count: aqExpired, error: aqEErr },
  ] = await Promise.all([
    supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .is('deleted_at', null),
    supabase.from('tenants')
      .select('id', { count: 'exact', head: true }),
    supabase.from('trust_scores')
      .select('tenant_id'),
    supabase.from('action_queue')
      .select('id', { count: 'exact', head: true }),
    supabase.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
    supabase.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'expired'),
  ])

  if (oErr) return { success: false, error: oErr.message }
  if (tErr) return { success: false, error: tErr.message }
  if (trErr) return { success: false, error: trErr.message }
  if (aqErr) return { success: false, error: aqErr.message }
  if (aqCErr) return { success: false, error: aqCErr.message }
  if (aqEErr) return { success: false, error: aqEErr.message }

  const trust_participants = new Set((trustRows ?? []).map((r: any) => r.tenant_id)).size
  const action_queue_total = aqTotal ?? 0
  const action_queue_completed = aqCompleted ?? 0
  const action_queue_expired = aqExpired ?? 0

  // MVP proxy metrics (오탐/오버라이드 테이블이 없으므로, expired를 "판단 실패/미처리"로 간주)
  const admin_intervention_rate = pct(action_queue_completed, Math.max(1, action_queue_total))
  const policy_automation_rate = 0  // 자동 completed(무인 실행) 구현 전
  const auto_judgement_accuracy = 100 - pct(action_queue_expired, Math.max(1, action_queue_total))

  const stats: PlatformStats = {
    confirmed_orders: confirmed_orders ?? 0,
    total_tenants: total_tenants ?? 0,
    trust_participants,
    action_queue_total,
    action_queue_completed,
    action_queue_expired,
    admin_intervention_rate,
    policy_automation_rate,
    auto_judgement_accuracy,
  }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'learning_collect_stats',
    reason: 'collect platform stats',
    target_table: 'orders/tenants/trust_scores/action_queue',
    new_value: stats,
  }).catch(() => {})

  return { success: true, data: stats }
}

export async function getLearningStatus(): Promise<ActionResult<{
  stage: LearningStage
  next_stage: LearningStage
  progress_rate: number
  conditions: {
    orders_500: { current: number; target: number; ok: boolean }
    trust_50: { current: number; target: number; ok: boolean }
    accuracy_70: { current: number; target: number; ok: boolean }
  }
  policy_automation_rate: number
  admin_intervention_rate: number
  stats: PlatformStats
}>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const sRes = await collectPlatformStats()
  if (!sRes.success || !sRes.data) return { success: false, error: sRes.error ?? 'stats 실패' }
  const s = sRes.data

  const stage = stageFromStats(s)
  const next_stage = stage === 'MVP' ? '중기' : '후기'

  const c1 = { current: s.confirmed_orders, target: 500, ok: s.confirmed_orders >= 500 }
  const c2 = { current: s.trust_participants, target: 50, ok: s.trust_participants >= 50 }
  const c3 = { current: s.auto_judgement_accuracy, target: 70, ok: s.auto_judgement_accuracy >= 70 }

  const progress_rate = Math.round(((c1.current / c1.target) + (c2.current / c2.target) + (c3.current / c3.target)) / 3 * 100)

  return {
    success: true,
    data: {
      stage,
      next_stage,
      progress_rate: Math.max(0, Math.min(100, progress_rate)),
      conditions: { orders_500: c1, trust_50: c2, accuracy_70: c3 },
      policy_automation_rate: s.policy_automation_rate,
      admin_intervention_rate: s.admin_intervention_rate,
      stats: s,
    },
  }
}

