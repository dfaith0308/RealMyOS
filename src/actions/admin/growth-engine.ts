'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

function sellerKey(row: { seller_tenant_id?: string | null; tenant_id?: string | null }) {
  return String(row.seller_tenant_id ?? row.tenant_id ?? '')
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
    action_type: string
    tenant_id?: string | null
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: any
    new_value?: any
  },
) {
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

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

function isoDayStartDaysAgo(days: number) {
  const d = new Date(Date.now() + 9 * 3600000)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export interface ChurnCustomerRow {
  seller_tenant_id: string
  customer_id: string
  customer_name: string
  reasons: string[]
  last_order_date: string | null
}

export interface DormantTenantRow {
  tenant_id: string
  tenant_label: string
  last_login_at: string | null
  last_trade_at: string | null
}

export interface GrowthMetrics {
  new_participants_30d: number
  active_participants_30d: number
  churn_risk_customers: number
  dormant_tenants: number
  platform_gmv_30d: number
  monthly_gmv_trend: Array<{ month: string; gmv: number }>
  churn_customer_rows: ChurnCustomerRow[]
  dormant_rows: DormantTenantRow[]
}

function orderAmount(o: { final_amount?: number | null; total_amount?: number | null }) {
  const f = o.final_amount
  const t = o.total_amount
  if (typeof f === 'number' && Number.isFinite(f)) return f
  if (typeof t === 'number' && Number.isFinite(t)) return t
  return 0
}

async function loadExistingTradeTodayKeys(supabase: any): Promise<Set<string>> {
  const { data: existing } = await supabase
    .from('action_queue')
    .select('action_options')
    .eq('category', 'trade')
    .eq('priority', 'today')
    .in('status', ['pending', 'in_progress'])
    .limit(600)

  const keys = new Set<string>()
  for (const e of (existing ?? []) as any[]) {
    const m = e.action_options ?? {}
    if (m.dedup_key) keys.add(String(m.dedup_key))
  }
  return keys
}

async function loadExistingDormantKeys(supabase: any): Promise<Set<string>> {
  const { data: existing } = await supabase
    .from('action_queue')
    .select('action_options')
    .eq('category', 'trade')
    .eq('priority', 'normal')
    .in('status', ['pending', 'in_progress'])
    .limit(600)

  const keys = new Set<string>()
  for (const e of (existing ?? []) as any[]) {
    const m = e.action_options ?? {}
    if (m.kind === 'dormant_reengage' && m.tenant_id) keys.add(String(m.tenant_id))
  }
  return keys
}

/** 최근 120일 확정 주문 스냅샷 — 거래처별 이탈 신호 계산에 사용 */
async function fetchRecentConfirmedOrders(supabase: any) {
  const sinceDay = isoDayStartDaysAgo(120)
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_date, customer_id, tenant_id, seller_tenant_id, status')
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .gte('order_date', sinceDay)
    .limit(8000)

  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{
    id: string
    order_date: string
    customer_id: string
    tenant_id: string | null
    seller_tenant_id: string | null
    status: string
  }>
}

function buildChurnCustomerSignals(
  orders: Awaited<ReturnType<typeof fetchRecentConfirmedOrders>>,
): Map<string, ChurnCustomerRow & { dedup_key: string }> {
  const t30 = isoDayStartDaysAgo(30)
  const t60 = isoDayStartDaysAgo(60)

  type Agg = { dates: string[]; seller: string; customer: string }
  const byPair = new Map<string, Agg>()

  for (const o of orders) {
    const s = sellerKey(o)
    if (!s || !o.customer_id) continue
    const key = `${s}:${o.customer_id}`
    let a = byPair.get(key)
    if (!a) {
      a = { dates: [], seller: s, customer: o.customer_id }
      byPair.set(key, a)
    }
    a.dates.push(o.order_date)
  }

  const out = new Map<string, ChurnCustomerRow & { dedup_key: string }>()

  for (const [pairKey, agg] of byPair) {
    const sorted = [...new Set(agg.dates)].sort((a, b) => a.localeCompare(b))
    const last = sorted.length ? sorted[sorted.length - 1]! : null

    let recent = 0
    let prev = 0
    for (const d of sorted) {
      if (d >= t30) recent++
      else if (d >= t60 && d < t30) prev++
    }

    const reasons: string[] = []
    if (last && last < t30) reasons.push('최근 30일 주문 없음')
    if (prev > 0 && recent <= Math.floor(prev * 0.5)) reasons.push('주문 빈도 50% 이상 감소(30일 대비 직전 30일)')

    if (reasons.length) {
      out.set(pairKey, {
        dedup_key: `churn:cust:${pairKey}`,
        seller_tenant_id: agg.seller,
        customer_id: agg.customer,
        customer_name: '-',
        reasons,
        last_order_date: last,
      })
    }
  }

  return out
}

async function mergeTrustDropTenants(
  supabase: any,
  churnMap: Map<string, ChurnCustomerRow & { dedup_key: string }>,
) {
  const since = isoDaysAgo(30)
  const { data: logs, error } = await supabase
    .from('admin_logs')
    .select('tenant_id, old_value, new_value, created_at')
    .eq('action_type', 'trust_update')
    .eq('target_table', 'trust_scores')
    .gte('created_at', since)
    .limit(800)

  if (error) throw new Error(error.message)

  const seenTenant = new Set<string>()
  for (const row of (logs ?? []) as any[]) {
    const tid = row.tenant_id as string | null
    if (!tid) continue

    const os = row.old_value?.score
    const ns = row.new_value?.score
    if (typeof os !== 'number' || typeof ns !== 'number') continue
    if (os - ns < 10) continue
    if (seenTenant.has(tid)) continue
    seenTenant.add(tid)

    const dedup_key = `churn:trust:${tid}`
    churnMap.set(dedup_key, {
      dedup_key,
      seller_tenant_id: tid,
      customer_id: '',
      customer_name: '(참여자 신뢰도 급락)',
      reasons: [`30일 내 신뢰점수 ${os}→${ns} (△${os - ns})`],
      last_order_date: null,
    })
  }
}

export async function detectChurnRisk(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const orders = await fetchRecentConfirmedOrders(supabase)
  const churnMap = buildChurnCustomerSignals(orders)
  await mergeTrustDropTenants(supabase, churnMap)

  const existing = await loadExistingTradeTodayKeys(supabase)
  const customerIds = [...new Set([...churnMap.values()].map((r) => r.customer_id).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (customerIds.length) {
    const { data: custRows } = await supabase.from('customers').select('id, name').in('id', customerIds).limit(2000)
    for (const c of (custRows ?? []) as any[]) nameMap.set(c.id, c.name ?? '-')
  }

  const nowIso = new Date().toISOString()
  const inserts: any[] = []

  for (const row of churnMap.values()) {
    if (existing.has(row.dedup_key)) continue
    const cname = row.customer_id ? nameMap.get(row.customer_id) ?? '-' : row.customer_name
    inserts.push({
      priority: 'today',
      category: 'trade',
      title: row.customer_id ? `이탈 위험 거래처: ${cname}` : `이탈 위험: 신뢰도 급락 (${row.seller_tenant_id.slice(0, 8)}…)`,
      description: row.reasons.join(' / '),
      status: 'pending',
      action_options: {
        dedup_key: row.dedup_key,
        kind: 'churn_risk',
        seller_tenant_id: row.seller_tenant_id,
        customer_id: row.customer_id || null,
        reasons: row.reasons,
        last_order_date: row.last_order_date,
      },
      target_tenant_id: row.seller_tenant_id,
      expires_at: null,
      escalated_at: null,
      resolved_by: null,
      resolved_at: null,
      created_at: nowIso,
    })
  }

  if (inserts.length) {
    const { error } = await supabase.from('action_queue').insert(inserts)
    if (error) return { success: false, error: error.message }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'growth_churn_detect',
    tenant_id: null,
    reason: 'detectChurnRisk enqueue',
    target_table: 'action_queue',
    new_value: { created: inserts.length },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/growth')
  return { success: true, data: { created: inserts.length } }
}

export async function detectDormant(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const d90 = isoDayStartDaysAgo(90)

  const [{ data: tenants, error: tenErr }, { data: userRows, error: uErr }, { data: orders, error: oErr }, { data: rfqs, error: rErr }] =
    await Promise.all([
      supabase.from('tenants').select('id, name, created_at').limit(5000),
      supabase.from('users').select('tenant_id, updated_at').not('tenant_id', 'is', null).limit(20000),
      supabase
        .from('orders')
        .select('order_date, tenant_id, seller_tenant_id')
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .limit(12000),
      supabase.from('rfq_requests').select('tenant_id, created_at').limit(12000),
    ])

  if (tenErr) return { success: false, error: tenErr.message }
  if (uErr) return { success: false, error: uErr.message }
  if (oErr) return { success: false, error: oErr.message }
  if (rErr) return { success: false, error: rErr.message }

  const lastLogin = new Map<string, string>()
  for (const u of (userRows ?? []) as any[]) {
    const tid = u.tenant_id as string
    const ua = u.updated_at as string
    const prev = lastLogin.get(tid)
    if (!prev || ua > prev) lastLogin.set(tid, ua)
  }

  const lastTrade = new Map<string, string>()
  for (const o of (orders ?? []) as any[]) {
    const od = o.order_date as string
    const sk = sellerKey(o)
    if (sk) {
      const p = lastTrade.get(sk)
      if (!p || od > p) lastTrade.set(sk, od)
    }
  }
  for (const r of (rfqs ?? []) as any[]) {
    const tid = r.tenant_id as string
    const ca = r.created_at as string
    if (!tid) continue
    const p = lastTrade.get(tid)
    if (!ca) continue
    if (!p || ca.slice(0, 10) > p) lastTrade.set(tid, ca.slice(0, 10))
  }

  const existing = await loadExistingDormantKeys(supabase)
  const nowIso = new Date().toISOString()
  const inserts: any[] = []

  for (const t of (tenants ?? []) as any[]) {
    const tid = t.id as string
    const lu = lastLogin.get(tid)
    const lt = lastTrade.get(tid)
    const loginStale = !lu || lu.slice(0, 10) < d90
    const tradeStale = !lt || lt < d90
    if (!(loginStale && tradeStale)) continue
    if (existing.has(tid)) continue

    inserts.push({
      priority: 'normal',
      category: 'trade',
      title: `휴면 참여자 재활성: ${t.name ?? tid.slice(0, 8)}`,
      description: `로그인/거래 신호 90일 초과 (login:${lu?.slice(0, 10) ?? '없음'}, trade:${lt ?? '없음'})`,
      status: 'pending',
      action_options: {
        kind: 'dormant_reengage',
        tenant_id: tid,
        last_login_at: lu ?? null,
        last_trade_at: lt ?? null,
      },
      target_tenant_id: tid,
      expires_at: null,
      escalated_at: null,
      resolved_by: null,
      resolved_at: null,
      created_at: nowIso,
    })
  }

  if (inserts.length) {
    const { error } = await supabase.from('action_queue').insert(inserts)
    if (error) return { success: false, error: error.message }
  }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'growth_dormant_detect',
    reason: 'detectDormant enqueue',
    target_table: 'action_queue',
    new_value: { created: inserts.length },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/growth')
  return { success: true, data: { created: inserts.length } }
}

export async function getGrowthMetrics(): Promise<ActionResult<GrowthMetrics>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const day30 = isoDayStartDaysAgo(30)
  const sixMo = isoDayStartDaysAgo(185)

  const [
    { data: tenantsNew, error: e1 },
    { data: orders180, error: e2 },
    { data: rfqRecent, error: e3 },
    orders120,
  ] = await Promise.all([
    supabase.from('tenants').select('id, created_at').gte('created_at', `${day30}T00:00:00.000Z`).limit(5000),
    supabase
      .from('orders')
      .select('order_date, final_amount, total_amount, tenant_id, seller_tenant_id')
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('order_date', sixMo.slice(0, 10))
      .limit(20000),
    supabase.from('rfq_requests').select('tenant_id, created_at').gte('created_at', `${day30}T00:00:00.000Z`).limit(8000),
    fetchRecentConfirmedOrders(supabase),
  ])

  if (e1) return { success: false, error: e1.message }
  if (e2) return { success: false, error: e2.message }
  if (e3) return { success: false, error: e3.message }

  const monthlyMap = new Map<string, number>()
  let gmv30 = 0
  const activeTenants = new Set<string>()

  for (const o of (orders180 ?? []) as any[]) {
    const amt = orderAmount(o)
    const month = String(o.order_date).slice(0, 7)
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + amt)
    if (String(o.order_date) >= day30) {
      gmv30 += amt
      const sk = sellerKey(o)
      if (sk) activeTenants.add(sk)
    }
  }

  for (const r of (rfqRecent ?? []) as any[]) {
    if (r.tenant_id) activeTenants.add(r.tenant_id)
  }

  const churnMap = buildChurnCustomerSignals(orders120)
  await mergeTrustDropTenants(supabase, churnMap)

  const customerIds = [...new Set([...churnMap.values()].map((r) => r.customer_id).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (customerIds.length) {
    const { data: custRows } = await supabase.from('customers').select('id, name').in('id', customerIds).limit(2000)
    for (const c of (custRows ?? []) as any[]) nameMap.set(c.id, c.name ?? '-')
  }

  const churnRows: ChurnCustomerRow[] = [...churnMap.values()].map((r) => ({
    seller_tenant_id: r.seller_tenant_id,
    customer_id: r.customer_id,
    customer_name: r.customer_id ? nameMap.get(r.customer_id) ?? '-' : r.customer_name,
    reasons: r.reasons,
    last_order_date: r.last_order_date,
  }))

  // 휴면 목록은 detectDormant와 동일 규칙으로 계산(삽입 없이 표시만)
  const d90 = isoDayStartDaysAgo(90)
  const [{ data: allTenants, error: teErr }, { data: userRows, error: ueErr }, { data: allOrders, error: oeErr }, { data: allRfqs, error: reErr }] =
    await Promise.all([
      supabase.from('tenants').select('id, name').limit(5000),
      supabase.from('users').select('tenant_id, updated_at').not('tenant_id', 'is', null).limit(20000),
      supabase
        .from('orders')
        .select('order_date, tenant_id, seller_tenant_id')
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .limit(12000),
      supabase.from('rfq_requests').select('tenant_id, created_at').limit(12000),
    ])
  if (teErr) return { success: false, error: teErr.message }
  if (ueErr) return { success: false, error: ueErr.message }
  if (oeErr) return { success: false, error: oeErr.message }
  if (reErr) return { success: false, error: reErr.message }

  const lastLoginM = new Map<string, string>()
  for (const u of (userRows ?? []) as any[]) {
    const tid = u.tenant_id as string
    const ua = u.updated_at as string
    const prev = lastLoginM.get(tid)
    if (!prev || ua > prev) lastLoginM.set(tid, ua)
  }
  const lastTradeM = new Map<string, string>()
  for (const o of (allOrders ?? []) as any[]) {
    const od = o.order_date as string
    const sk = sellerKey(o)
    if (sk) {
      const p = lastTradeM.get(sk)
      if (!p || od > p) lastTradeM.set(sk, od)
    }
  }
  for (const r of (allRfqs ?? []) as any[]) {
    const tid = r.tenant_id as string
    const ca = r.created_at as string
    if (!tid || !ca) continue
    const day = ca.slice(0, 10)
    const p = lastTradeM.get(tid)
    if (!p || day > p) lastTradeM.set(tid, day)
  }

  const dormantRows: DormantTenantRow[] = []
  for (const t of (allTenants ?? []) as any[]) {
    const tid = t.id as string
    const lu = lastLoginM.get(tid)
    const lt = lastTradeM.get(tid)
    const loginStale = !lu || lu.slice(0, 10) < d90
    const tradeStale = !lt || lt < d90
    if (loginStale && tradeStale) {
      dormantRows.push({
        tenant_id: tid,
        tenant_label: t.name ?? tid.slice(0, 8),
        last_login_at: lu ?? null,
        last_trade_at: lt ?? null,
      })
    }
  }

  const months: string[] = []
  const anchor = new Date(Date.now() + 9 * 3600000)
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    months.push(key)
  }
  const monthly_gmv_trend = months.map((month) => ({
    month,
    gmv: monthlyMap.get(month) ?? 0,
  }))

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'growth_metrics_view',
    target_table: 'growth_engine',
    new_value: {
      new_participants_30d: (tenantsNew ?? []).length,
      churn_rows: churnRows.length,
      dormant: dormantRows.length,
    },
  }).catch(() => {})

  return {
    success: true,
    data: {
      new_participants_30d: (tenantsNew ?? []).length,
      active_participants_30d: activeTenants.size,
      churn_risk_customers: churnRows.length,
      dormant_tenants: dormantRows.length,
      platform_gmv_30d: gmv30,
      monthly_gmv_trend,
      churn_customer_rows: churnRows.slice(0, 80),
      dormant_rows: dormantRows.slice(0, 80),
    },
  }
}
