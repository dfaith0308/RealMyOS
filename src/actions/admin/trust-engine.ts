'use server'

import { getTrustLevelThresholds } from '@/actions/admin/policy-console'
import { resolveTrustLevel } from '@/lib/policy-utils'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export type TrustRole = 'restaurant' | 'supplier'

export interface TrustScoreRow {
  id: string
  tenant_id: string
  role: TrustRole
  score: number
  delivery_rate: number | null
  claim_count: number | null
  payment_rate: number | null
  rfq_complete_rate: number | null
  repeat_trade_rate: number | null
  level: number | null
  cooldown_until: string | null
  violation_count: number | null
  updated_at: string | null
}

export interface ParticipantRow {
  tenant_id: string
  tenant_name: string | null
  role: TrustRole
  score: number
  level: number
  cooldown_until: string | null
  updated_at: string | null
  components: {
    delivery_rate?: number | null
    claim_count?: number | null
    payment_rate?: number | null
    rfq_complete_rate?: number | null
    repeat_trade_rate?: number | null
    violation_count?: number | null
  }
}

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function calcScoreFromRow(row: Partial<TrustScoreRow>): number {
  // NOTE: 데이터 소스(orders/payments/claims/delivery_logs/bid_participation)로부터의 정교한 계산은 후속.
  // 현재는 trust_scores의 구성 요소 컬럼을 기반으로 재계산한다.
  const delivery = row.delivery_rate ?? null
  const payment = row.payment_rate ?? null
  const rfq = row.rfq_complete_rate ?? null
  const repeat = row.repeat_trade_rate ?? null
  const claims = row.claim_count ?? 0
  const violations = row.violation_count ?? 0

  // base score
  let score = 100

  if (delivery != null) score = score - (100 - clamp(delivery, 0, 100)) * 0.35
  if (payment != null) score = score - (100 - clamp(payment, 0, 100)) * 0.35
  if (rfq != null) score = score - (100 - clamp(rfq, 0, 100)) * 0.15
  if (repeat != null) score = score - (100 - clamp(repeat, 0, 100)) * 0.10

  // penalties
  score -= claims * 3
  score -= violations * 5

  return Math.round(clamp(score, 0, 100))
}

async function enqueueTrustLevel3ActionQueue(supabase: any, input: {
  tenant_id: string
  role: TrustRole
  score: number
}) {
  const title = input.role === 'supplier'
    ? '공급자 Level 3 — 입찰 차단 필요'
    : '식당 Level 3 — RFQ 제한 필요'
  const description = input.role === 'supplier'
    ? `공급자 신뢰도 ${input.score}점 → Level 3 진입`
    : `식당 신뢰도 ${input.score}점 → Level 3 진입`

  // 중복 방지(best-effort): 같은 tenant+role의 pending/in_progress가 이미 있으면 skip
  const { data: existing } = await supabase
    .from('action_queue')
    .select('id, action_options')
    .eq('category', 'trust')
    .in('status', ['pending', 'in_progress'])
    .eq('target_tenant_id', input.tenant_id)
    .limit(200)

  const exists = (existing ?? []).some((e: any) => (e.action_options ?? {})?.role === input.role)
  if (exists) return

  await supabase.from('action_queue').insert({
    priority: 'critical',
    category: 'trust',
    title,
    description,
    status: 'pending',
    action_options: { role: input.role, score: input.score },
    target_tenant_id: input.tenant_id,
    escalated_at: null,
    resolved_by: null,
    resolved_at: null,
  })
}

function orderAmount(o: { final_amount?: number | null; total_amount?: number | null }) {
  const f = o.final_amount
  const t = o.total_amount
  if (typeof f === 'number' && Number.isFinite(f)) return f
  if (typeof t === 'number' && Number.isFinite(t)) return t
  return 0
}

function monthRangeUtcNow() {
  const anchor = new Date(Date.now() + 9 * 3600000)
  const y = anchor.getUTCFullYear()
  const m = anchor.getUTCMonth()
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const endDate = new Date(Date.UTC(y, m + 1, 0))
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`
  return { start, end }
}

function daysSinceIso(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 9999
  return Math.floor((Date.now() - t) / 86400000)
}

async function loadTenantRole(supabase: any, tenant_id: string): Promise<TrustRole | null> {
  const { data } = await supabase.from('tenants').select('id, role').eq('id', tenant_id).maybeSingle()
  const r = String((data as any)?.role ?? '')
  if (r === 'supplier') return 'supplier'
  if (r === 'restaurant') return 'restaurant'
  return null
}

async function computeMetricsForTenant(supabase: any, tenant_id: string, role: TrustRole) {
  const { start, end } = monthRangeUtcNow()
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString()

  // orders scope
  const ordersScope =
    role === 'supplier'
      ? `seller_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`
      : `buyer_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`

  const [{ data: ordersConfirmed, error: oErr }, { data: paysConfirmed, error: pErr }, { data: claimRows, error: cErr }, { data: rfqRows, error: rErr }, { data: customers, error: cuErr }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id, customer_id, status, order_status, order_date, final_amount, total_amount')
        .or(ordersScope)
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .gte('order_date', start)
        .lte('order_date', end)
        .limit(25000),
      supabase
        .from('payments')
        .select('amount, status, direction, created_at, payer_tenant_id, payee_tenant_id, tenant_id')
        .eq('direction', role === 'supplier' ? 'inbound' : 'outbound')
        .eq('status', 'confirmed')
        .gte('created_at', `${start}T00:00:00.000Z`)
        .lte('created_at', `${end}T23:59:59.999Z`)
        .or(
          role === 'supplier'
            ? `payee_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`
            : `payer_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`,
        )
        .limit(25000),
      supabase
        .from('contact_logs')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('outcome_type', 'claim')
        .gte('contacted_at', since90)
        .limit(25000),
      supabase
        .from('rfq_requests')
        .select('id, status')
        .eq('tenant_id', tenant_id)
        .limit(25000),
      supabase.from('customers').select('id').eq('tenant_id', tenant_id).is('deleted_at', null).limit(25000),
    ])

  if (oErr) throw new Error(oErr.message)
  if (pErr) throw new Error(pErr.message)
  if (cErr) throw new Error(cErr.message)
  if (rErr) throw new Error(rErr.message)
  if (cuErr) throw new Error(cuErr.message)

  const totalConfirmed = (ordersConfirmed ?? []).length
  const delivered = (ordersConfirmed ?? []).filter((o: any) => o.order_status === '납품완료').length
  const delivery_rate = totalConfirmed > 0 ? Math.round((delivered / totalConfirmed) * 1000) / 10 : null

  const monthOrdersAmount = (ordersConfirmed ?? []).reduce((s: number, o: any) => s + orderAmount(o), 0)
  const monthPaidAmount = (paysConfirmed ?? []).reduce((s: number, p: any) => s + (typeof (p as any).amount === 'number' ? (p as any).amount : 0), 0)
  const payment_rate = monthOrdersAmount > 0 ? Math.round((monthPaidAmount / monthOrdersAmount) * 1000) / 10 : null

  const claim_count = (claimRows ?? []).length

  const rfqTotal = (rfqRows ?? []).length
  const rfqClosed = (rfqRows ?? []).filter((r: any) => r.status === 'closed').length
  const rfq_complete_rate = rfqTotal > 0 ? Math.round((rfqClosed / rfqTotal) * 1000) / 10 : null

  const custTotal = (customers ?? []).length
  const orders90 = (await supabase
    .from('orders')
    .select('customer_id, order_date, status')
    .or(ordersScope)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .gte('order_date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    .limit(25000)).data ?? []

  const countByCustomer = new Map<string, number>()
  for (const o of orders90 as any[]) {
    if (!o.customer_id) continue
    countByCustomer.set(o.customer_id, (countByCustomer.get(o.customer_id) ?? 0) + 1)
  }
  const repeatCustomers = [...countByCustomer.values()].filter((n) => n >= 2).length
  const repeat_trade_rate = custTotal > 0 ? Math.round((repeatCustomers / custTotal) * 1000) / 10 : null

  return { delivery_rate, payment_rate, claim_count, rfq_complete_rate, repeat_trade_rate }
}

export async function calculateTrustScore(
  tenant_id: string,
  role: TrustRole,
): Promise<ActionResult<{ score: number; level: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const { data: row, error } = await supabase
    .from('trust_scores')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('role', role)
    .maybeSingle()

  if (error) return { success: false, error: error.message }

  const computedScore = calcScoreFromRow(row ?? { role } as any)
  const thresholds = await getTrustLevelThresholds(supabase, auth.ctx.user_id)
  const level = resolveTrustLevel(role, computedScore, thresholds)

  // 조회 로그 best-effort
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_calculate',
    tenant_id,
    target_table: 'trust_scores',
    reason: 'calculate trust score (dry)',
    new_value: { role, score: computedScore, level },
  }).catch(() => {})

  return { success: true, data: { score: computedScore, level } }
}

export async function updateTrustScore(
  tenant_id: string,
  role: TrustRole,
): Promise<ActionResult<{ score: number; level: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const { data: before, error: bErr } = await supabase
    .from('trust_scores')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('role', role)
    .maybeSingle()

  if (bErr) return { success: false, error: bErr.message }

  const computedScore = calcScoreFromRow(before ?? { role } as any)
  const thresholds = await getTrustLevelThresholds(supabase, auth.ctx.user_id)
  const level = resolveTrustLevel(role, computedScore, thresholds)

  const payload: any = {
    tenant_id,
    role,
    score: computedScore,
    level,
    updated_at: new Date().toISOString(),
  }

  const { data: upserted, error: uErr } = await supabase
    .from('trust_scores')
    .upsert(payload, { onConflict: 'tenant_id,role' })
    .select('id')
    .single()

  if (uErr) {
    // onConflict가 없을 수 있음 → fallback to insert/update
    const { data: existing2 } = await supabase
      .from('trust_scores')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('role', role)
      .maybeSingle()

    if (existing2?.id) {
      const { error: updErr } = await supabase
        .from('trust_scores')
        .update(payload)
        .eq('id', existing2.id)
      if (updErr) return { success: false, error: updErr.message }
    } else {
      const { error: insErr } = await supabase
        .from('trust_scores')
        .insert(payload)
      if (insErr) return { success: false, error: insErr.message }
    }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_update',
    tenant_id,
    target_table: 'trust_scores',
    target_id: upserted?.id ?? (before as any)?.id ?? null,
    old_value: before ?? null,
    new_value: { score: computedScore, level },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  if (level >= 3) {
    await enqueueTrustLevel3ActionQueue(supabase, { tenant_id, role, score: computedScore }).catch(() => {})
  }

  return { success: true, data: { score: computedScore, level } }
}

export async function getParticipants(filters?: {
  role?: TrustRole
  level?: number
  score_min?: number
  score_max?: number
}): Promise<ActionResult<ParticipantRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let q = supabase
    .from('trust_scores')
    .select('tenant_id, role, score, level, cooldown_until, updated_at, delivery_rate, claim_count, payment_rate, rfq_complete_rate, repeat_trade_rate, violation_count')
    .order('score', { ascending: true })
    .limit(500)

  if (filters?.role) q = q.eq('role', filters.role)
  if (filters?.level != null) q = q.eq('level', filters.level)
  if (filters?.score_min != null) q = q.gte('score', filters.score_min)
  if (filters?.score_max != null) q = q.lte('score', filters.score_max)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const rows = (data ?? []) as any[]
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))]
  const { data: tenants } = tenantIds.length
    ? await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds)
    : { data: [] as any[] }

  const nameMap = new Map((tenants ?? []).map((t: any) => [t.id, t.name ?? null]))

  const thresholds = await getTrustLevelThresholds(supabase, auth.ctx.user_id)

  const out: ParticipantRow[] = rows.map((r) => ({
    tenant_id: r.tenant_id,
    tenant_name: nameMap.get(r.tenant_id) ?? null,
    role: r.role,
    score: r.score ?? 0,
    level: r.level ?? resolveTrustLevel(r.role, r.score ?? 0, thresholds),
    cooldown_until: r.cooldown_until ?? null,
    updated_at: r.updated_at ?? null,
    components: {
      delivery_rate: r.delivery_rate ?? null,
      claim_count: r.claim_count ?? null,
      payment_rate: r.payment_rate ?? null,
      rfq_complete_rate: r.rfq_complete_rate ?? null,
      repeat_trade_rate: r.repeat_trade_rate ?? null,
      violation_count: r.violation_count ?? null,
    },
  }))

  // 조회 로그 best-effort
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'participants_view',
    target_table: 'trust_scores',
  }).catch(() => {})

  return { success: true, data: out }
}

export async function getRelationships(filters?: {
  status?: string
  score_min?: number
  score_max?: number
}): Promise<ActionResult<Array<{
  id: string
  restaurant_tenant_id: string
  supplier_tenant_id: string
  restaurant_name: string | null
  supplier_name: string | null
  trust_score: number
  relationship_status: string
  cooldown_until: string | null
  created_at: string | null
}>>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  let q = supabase
    .from('relationships')
    .select('id, restaurant_tenant_id, supplier_tenant_id, trust_score, relationship_status, cooldown_until, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters?.status) q = q.eq('relationship_status', filters.status)
  if (filters?.score_min != null) q = q.gte('trust_score', filters.score_min)
  if (filters?.score_max != null) q = q.lte('trust_score', filters.score_max)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const rows = (data ?? []) as any[]
  const tenantIds = [...new Set(rows.flatMap((r) => [r.restaurant_tenant_id, r.supplier_tenant_id]).filter(Boolean))]
  const { data: tenants } = tenantIds.length
    ? await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds)
    : { data: [] as any[] }

  const nameMap = new Map((tenants ?? []).map((t: any) => [t.id, t.name ?? null]))

  // 조회 로그 best-effort
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'relationships_view',
    target_table: 'relationships',
  }).catch(() => {})

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      restaurant_tenant_id: r.restaurant_tenant_id,
      supplier_tenant_id: r.supplier_tenant_id,
      restaurant_name: nameMap.get(r.restaurant_tenant_id) ?? null,
      supplier_name: nameMap.get(r.supplier_tenant_id) ?? null,
      trust_score: r.trust_score ?? 0,
      relationship_status: r.relationship_status ?? '-',
      cooldown_until: r.cooldown_until ?? null,
      created_at: r.created_at ?? null,
    })),
  }
}

export async function syncTrustScoreFromRealData(tenant_id: string): Promise<ActionResult<{ updated: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const role = await loadTenantRole(supabase, tenant_id)
  if (!role) return { success: false, error: '지원되지 않는 tenant role 입니다.' }

  const thresholds = await getTrustLevelThresholds(supabase, auth.ctx.user_id)

  const { data: before, error: bErr } = await supabase
    .from('trust_scores')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('role', role)
    .maybeSingle()

  if (bErr) return { success: false, error: bErr.message }

  const metrics = await computeMetricsForTenant(supabase, tenant_id, role)
  const computedScore = calcScoreFromRow({ ...(before ?? { tenant_id, role } as any), ...metrics })
  const level = resolveTrustLevel(role, computedScore, thresholds)
  const beforeScore = before?.score ?? null
  const beforeLevel = before?.level ?? null

  const payload: any = {
    tenant_id,
    role,
    score: computedScore,
    level,
    delivery_rate: metrics.delivery_rate,
    payment_rate: metrics.payment_rate,
    claim_count: metrics.claim_count,
    rfq_complete_rate: metrics.rfq_complete_rate,
    repeat_trade_rate: metrics.repeat_trade_rate,
    updated_at: new Date().toISOString(),
  }

  const { data: up, error: uErr } = await supabase
    .from('trust_scores')
    .upsert(payload, { onConflict: 'tenant_id,role' })
    .select('id')
    .single()

  if (uErr) return { success: false, error: uErr.message }

  // FORENSIC-004-C: score change log (best-effort DB exists; admin-only RLS)
  const changed =
    beforeScore == null ||
    beforeLevel == null ||
    Number(beforeScore) !== Number(computedScore) ||
    Number(beforeLevel) !== Number(level)
  if (changed) {
    const { error: lErr } = await supabase.from('trust_score_logs').insert({
      tenant_id,
      role,
      before_score: beforeScore,
      after_score: computedScore,
      before_level: beforeLevel,
      after_level: level,
      reason: 'sync_from_real_data',
      changed_by: null,
    })
    if (lErr) {
      // log insert 실패는 동기화 실패로 간주하지 않음 (RLS/권한/테이블 미적용 등)
    }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_sync_realdata',
    tenant_id,
    target_table: 'trust_scores',
    target_id: up?.id ?? null,
    reason: 'syncTrustScoreFromRealData',
    old_value: before ?? null,
    new_value: { ...metrics, score: computedScore, level },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  if (level >= 3) {
    await enqueueTrustLevel3ActionQueue(supabase, { tenant_id, role, score: computedScore }).catch(() => {})
  }

  return { success: true, data: { updated: 1 } }
}

export async function runTrustSyncBatch(): Promise<ActionResult<{ updated_tenants: number; skipped: number; errors: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const cycleDays = await getAdminSettingNumber('trust_update_cycle_days', { min: 1, max: 365 })

  const { data: tenants, error } = await supabase.from('tenants').select('id, role').in('role', ['supplier', 'restaurant']).limit(5000)
  if (error) return { success: false, error: error.message }

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const t of (tenants ?? []) as any[]) {
    const tid = String(t.id ?? '')
    const role: TrustRole | null = t.role === 'supplier' ? 'supplier' : t.role === 'restaurant' ? 'restaurant' : null
    if (!tid || !role) continue

    const { data: tsRow } = await supabase
      .from('trust_scores')
      .select('updated_at')
      .eq('tenant_id', tid)
      .eq('role', role)
      .maybeSingle()

    const last = tsRow?.updated_at as string | null | undefined
    if (last && daysSinceIso(last) < cycleDays) {
      skipped++
      continue
    }

    const r = await syncTrustScoreFromRealData(tid)
    if (r.success) updated++
    else errors++
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_sync_batch',
    tenant_id: null,
    target_table: 'trust_scores',
    reason: `runTrustSyncBatch (cycle_days=${cycleDays})`,
    new_value: { updated_tenants: updated, skipped, errors },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true, data: { updated_tenants: updated, skipped, errors } }
}

export interface TrustScoreLogRow {
  id: string
  created_at: string
  tenant_id: string
  role: TrustRole
  before_score: number | null
  after_score: number | null
  before_level: number | null
  after_level: number | null
  reason: string | null
  changed_by: string | null
}

export async function getTrustDetail(tenant_id: string, role?: TrustRole): Promise<ActionResult<TrustScoreRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  let q = supabase
    .from('trust_scores')
    .select('*')
    .eq('tenant_id', tenant_id)
    .limit(5)

  if (role) q = q.eq('role', role)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_detail_view',
    target_table: 'trust_scores',
    target_id: tenant_id,
    new_value: { tenant_id, role: role ?? null },
  }).catch(() => {})

  return { success: true, data: (data ?? []) as TrustScoreRow[] }
}

export async function getTrustScoreLogs(
  tenant_id: string,
  role?: TrustRole,
): Promise<ActionResult<TrustScoreLogRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  let q = supabase
    .from('trust_score_logs')
    .select('id, created_at, tenant_id, role, before_score, after_score, before_level, after_level, reason, changed_by')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (role) q = q.eq('role', role)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trust_score_logs_view',
    target_table: 'trust_score_logs',
    target_id: tenant_id,
    new_value: { tenant_id, role: role ?? null },
  }).catch(() => {})

  return { success: true, data: (data ?? []) as TrustScoreLogRow[] }
}

