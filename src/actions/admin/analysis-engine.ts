'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { detectTradeAnomalies } from '@/actions/admin/trade-monitor'

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

function kstToday() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

export interface RiskSummary {
  trust_risk_count: number
  trade_risk_count: number
  settlement_risk_count: number
  action_queue_open_count: number
  today_detected_count: number
}

export async function getRiskSummary(): Promise<ActionResult<RiskSummary>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const today = kstToday()

  const [
    { count: trust_risk_count, error: tErr },
    { count: action_queue_open_count, error: qErr },
    { count: today_detected_count, error: tdErr },
  ] = await Promise.all([
    supabase.from('trust_scores')
      .select('id', { count: 'exact', head: true })
      .gte('level', 2),
    supabase.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress']),
    supabase.from('action_queue')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00.000Z`),
  ])

  if (tErr) return { success: false, error: tErr.message }
  if (qErr) return { success: false, error: qErr.message }
  if (tdErr) return { success: false, error: tdErr.message }

  // trade/settlement risk count는 action_queue에서 category로 근사 (MVP)
  const { data: byCat, error: catErr } = await supabase
    .from('action_queue')
    .select('category')
    .in('status', ['pending', 'in_progress'])
    .limit(500)

  if (catErr) return { success: false, error: catErr.message }

  const trade_risk_count = (byCat ?? []).filter((r: any) => r.category === 'trade').length
  const settlement_risk_count = (byCat ?? []).filter((r: any) => r.category === 'settlement').length

  return {
    success: true,
    data: {
      trust_risk_count: trust_risk_count ?? 0,
      trade_risk_count,
      settlement_risk_count,
      action_queue_open_count: action_queue_open_count ?? 0,
      today_detected_count: today_detected_count ?? 0,
    },
  }
}

export async function runAnalysisEngine(): Promise<ActionResult<{ created: number; details: any }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  // 1) 신뢰도 위험 감지(급락의 "이전값"이 없으므로 MVP에선 Level 2/3를 위험으로 간주)
  const { data: lowTrust, error: ltErr } = await supabase
    .from('trust_scores')
    .select('tenant_id, role, score, level, updated_at')
    .gte('level', 2)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (ltErr) return { success: false, error: ltErr.message }

  // 2) 거래 위험 감지/4) 미정산 위험 감지: 기존 trade-monitor anomaly를 재사용(MVP)
  const anomaliesRes = await detectTradeAnomalies()
  if (!anomaliesRes.success || !anomaliesRes.data)
    return { success: false, error: anomaliesRes.error ?? 'trade anomalies 실패' }

  const anomalies = anomaliesRes.data.anomalies

  // 3) 직거래 시도: 미래 구현 (0건)
  const directTrade: any[] = []

  // 중복 방지(best-effort): target_tenant_id + category + action_options key 기반으로 pending/in_progress 존재 확인
  const { data: existing } = await supabase
    .from('action_queue')
    .select('id, category, target_tenant_id, action_options')
    .in('status', ['pending', 'in_progress'])
    .limit(500)

  const keySet = new Set<string>()
  for (const e of existing ?? []) {
    const meta = (e as any).action_options ?? {}
    const k = `${(e as any).category}:${(e as any).target_tenant_id ?? '-'}:${meta.role ?? ''}:${meta.rfq_id ?? ''}:${meta.payment_id ?? ''}`
    keySet.add(k)
  }

  const toInsert: any[] = []

  for (const r of lowTrust ?? []) {
    const meta = { role: (r as any).role, score: (r as any).score, level: (r as any).level }
    const k = `trust:${(r as any).tenant_id}:${meta.role}::`
    if (keySet.has(k)) continue
    toInsert.push({
      priority: (r as any).level >= 3 ? 'critical' : 'today',
      category: 'trust',
      title: '신뢰도 위험 감지',
      description: `${meta.role} trust score ${(r as any).score} (Level ${(r as any).level})`,
      status: 'pending',
      action_options: meta,
      target_tenant_id: (r as any).tenant_id,
    })
  }

  for (const a of anomalies) {
    const meta = a.meta ?? {}
    const k = `${a.category}:${a.target_tenant_id ?? '-'}:${meta.role ?? ''}:${meta.rfq_id ?? ''}:${meta.payment_id ?? ''}`
    if (keySet.has(k)) continue
    toInsert.push({
      priority: a.priority === 'high' ? 'today' : 'today', // MVP: High→Today로만 생성
      category: a.category,
      title: a.title,
      description: a.description,
      status: 'pending',
      action_options: meta,
      target_tenant_id: a.target_tenant_id,
    })
  }

  for (const d of directTrade) {
    const meta = d.meta ?? {}
    const k = `direct_trade:${d.target_tenant_id ?? '-'}:${meta.pattern ?? ''}::`
    if (keySet.has(k)) continue
    toInsert.push({
      priority: 'critical',
      category: 'direct_trade',
      title: d.title ?? '직거래 시도 감지',
      description: d.description ?? '플랫폼 외 결제 패턴(미래 구현)',
      status: 'pending',
      action_options: meta,
      target_tenant_id: d.target_tenant_id ?? null,
    })
  }

  if (toInsert.length) {
    const { error: insErr } = await supabase.from('action_queue').insert(toInsert)
    if (insErr) return { success: false, error: insErr.message }
  }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'analysis_engine_run',
    reason: 'run analysis engine (mvp rules)',
    target_table: 'trust_scores/action_queue',
    new_value: { created: toInsert.length },
  }).catch(() => {})

  return { success: true, data: { created: toInsert.length, details: { trust: (lowTrust ?? []).length, anomalies: anomalies.length } } }
}

