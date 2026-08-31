'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getRestaurantMetrics } from '@/actions/admin/dashboard-metrics'

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

async function fetchAllPaged<T>(
  // supabase-js query builder는 "thenable"이라 타입이 Promise로 좁혀지지 않을 수 있어 any로 받는다.
  makeQuery: (rangeFrom: number, rangeTo: number) => any,
  opts?: { pageSize?: number },
): Promise<T[]> {
  const pageSize = Math.max(100, Math.min(10000, opts?.pageSize ?? 5000))
  const out: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = (await makeQuery(offset, offset + pageSize - 1)) as { data: T[] | null; error: any }
    if (error) throw new Error(error.message ?? String(error))
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
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

/**
 * 신뢰도 급락 참여자 — 이탈과는 별개의 신호다.
 * 이전에는 이탈 목록에 섞어 넣어 "이탈 위험" 숫자를 부풀렸다.
 */
type TrustDropRow = { tenant_id: string; dedup_key: string; reason: string }

async function loadTrustDropTenants(supabase: any): Promise<TrustDropRow[]> {
  const since = isoDaysAgo(30)
  const { data: logs, error } = await supabase
    .from('admin_logs')
    .select('tenant_id, old_value, new_value, created_at')
    .eq('action_type', 'trust_update')
    .eq('target_table', 'trust_scores')
    .gte('created_at', since)
    // 상한: 최근 30일 내 trust_update 폭주 시 엔진 보호(지표 집계와 무관)
    .limit(800)

  if (error) throw new Error(error.message)

  const out: TrustDropRow[] = []
  const seen = new Set<string>()
  for (const row of (logs ?? []) as any[]) {
    const tid = row.tenant_id as string | null
    if (!tid || seen.has(tid)) continue

    const os = row.old_value?.score
    const ns = row.new_value?.score
    if (typeof os !== 'number' || typeof ns !== 'number') continue
    if (os - ns < 10) continue

    seen.add(tid)
    out.push({
      tenant_id: tid,
      dedup_key: `churn:trust:${tid}`,
      reason: `30일 내 신뢰점수 ${os}→${ns} (△${os - ns})`,
    })
  }
  return out
}

/**
 * 이탈 위험 거래처 — 판정은 대시보드 "주기 이탈 위험" 카드와 같은 함수를 쓴다.
 * (getRestaurantMetrics 내부의 classifyChurnSignal / @/lib/churn-signal)
 * 여기서 따로 계산하면 화면과 큐의 숫자가 다시 어긋난다.
 */
async function loadChurnRiskCustomers(supabase: any): Promise<
  Array<{ customer_id: string; tenant_id: string; dedup_key: string; name: string; reason: string }>
> {
  const res = await getRestaurantMetrics()
  if (!res.success) throw new Error(res.error)

  const rows = res.data.cycleRisk.rows
  if (rows.length === 0) return []

  // 거래처 소유 테넌트는 한 번에 받아 온다 — 행당 조회 없음
  const { data: custRows, error } = await supabase
    .from('customers')
    .select('id, tenant_id')
    .in('id', rows.map((r) => r.id))
  if (error) throw new Error(error.message)

  const ownerOf = new Map<string, string>(
    ((custRows ?? []) as any[]).map((c) => [c.id as string, c.tenant_id as string]),
  )

  return rows.flatMap((r) => {
    const tenant_id = ownerOf.get(r.id)
    if (!tenant_id) return []
    return [{
      customer_id: r.id,
      tenant_id,
      dedup_key: `churn:cust:${tenant_id}:${r.id}`,
      name: r.name,
      reason: `${r.meta} · ${r.value}`,
    }]
  })
}

export async function detectChurnRisk(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const [churnRows, trustRows, existing] = await Promise.all([
      loadChurnRiskCustomers(supabase),
      loadTrustDropTenants(supabase),
      loadExistingTradeTodayKeys(supabase),
    ])

    const nowIso = new Date().toISOString()
    const base = {
      priority: 'today' as const,
      category: 'trade' as const,
      status: 'pending' as const,
      expires_at: null,
      escalated_at: null,
      resolved_by: null,
      resolved_at: null,
      created_at: nowIso,
    }

    const inserts: any[] = []

    for (const row of churnRows) {
      if (existing.has(row.dedup_key)) continue
      inserts.push({
        ...base,
        title: `이탈 위험 거래처: ${row.name}`,
        description: row.reason,
        action_options: {
          dedup_key: row.dedup_key,
          kind: 'churn_risk',
          seller_tenant_id: row.tenant_id,
          customer_id: row.customer_id,
          reasons: [row.reason],
        },
        target_tenant_id: row.tenant_id,
      })
    }

    for (const row of trustRows) {
      if (existing.has(row.dedup_key)) continue
      inserts.push({
        ...base,
        title: `신뢰도 급락 (${row.tenant_id.slice(0, 8)}…)`,
        description: row.reason,
        action_options: {
          dedup_key: row.dedup_key,
          kind: 'trust_drop',
          seller_tenant_id: row.tenant_id,
          customer_id: null,
          reasons: [row.reason],
        },
        target_tenant_id: row.tenant_id,
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
      new_value: { created: inserts.length, churn: churnRows.length, trust_drop: trustRows.length },
    })
    if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

    revalidatePath('/admin/growth')
    return { success: true, data: { created: inserts.length } }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '이탈 위험 감지 실패' }
  }
}

export async function detectDormant(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const d90 = isoDayStartDaysAgo(90)

    // FORENSIC-009: 휴면 판별 프록시(users.updated_at) 제거 → 실제 활동 신호 기반
    // - contact_logs 마지막 활동일
    // - orders 마지막 주문일(confirmed)
    // - rfq_requests 마지막 발주일
    // 위 3가지 중 가장 최신 날짜를 활동일로 본다.

    const [tenants, contactRows, orderRows, rfqRows] = await Promise.all([
      fetchAllPaged<{ id: string; name: string | null; created_at?: string }>(
        (from, to) => supabase.from('tenants').select('id, name, created_at').order('id', { ascending: true }).range(from, to),
        { pageSize: 5000 },
      ),
      fetchAllPaged<{ tenant_id: string | null; contacted_at: string | null }>(
        (from, to) =>
          supabase
            .from('contact_logs')
            .select('tenant_id, contacted_at')
            .not('tenant_id', 'is', null)
            .order('contacted_at', { ascending: false })
            .range(from, to),
        { pageSize: 5000 },
      ),
      fetchAllPaged<{ order_date: string; tenant_id: string | null; seller_tenant_id: string | null }>(
        (from, to) =>
          supabase
            .from('orders')
            .select('order_date, tenant_id, seller_tenant_id')
            .eq('status', 'confirmed')
            .is('deleted_at', null)
            .order('order_date', { ascending: false })
            .range(from, to),
        { pageSize: 5000 },
      ),
      fetchAllPaged<{ tenant_id: string | null; created_at: string | null }>(
        (from, to) =>
          supabase
            .from('rfq_requests')
            .select('tenant_id, created_at')
            .not('tenant_id', 'is', null)
            .order('created_at', { ascending: false })
            .range(from, to),
        { pageSize: 5000 },
      ),
    ])

  const lastContact = new Map<string, string>()
  for (const r of (contactRows ?? []) as any[]) {
    const tid = r.tenant_id as string | null
    const ca = r.contacted_at as string | null
    if (!tid || !ca) continue
    const prev = lastContact.get(tid)
    if (!prev || ca > prev) lastContact.set(tid, ca)
  }

  const lastOrder = new Map<string, string>()
  for (const o of (orderRows ?? []) as any[]) {
    const od = o.order_date as string
    const sk = sellerKey(o)
    if (!sk || !od) continue
    const prev = lastOrder.get(sk)
    if (!prev || od > prev) lastOrder.set(sk, od)
  }

  const lastRfq = new Map<string, string>()
  for (const r of (rfqRows ?? []) as any[]) {
    const tid = r.tenant_id as string | null
    const ca = r.created_at as string | null
    if (!tid || !ca) continue
    const day = ca.slice(0, 10)
    const prev = lastRfq.get(tid)
    if (!prev || day > prev) lastRfq.set(tid, day)
  }

  const lastActivityDay = (tid: string) => {
    const c = lastContact.get(tid)?.slice(0, 10) ?? null
    const o = lastOrder.get(tid) ?? null
    const r = lastRfq.get(tid) ?? null
    return [c, o, r].filter(Boolean).sort().at(-1) ?? null
  }

    const existing = await loadExistingDormantKeys(supabase)
    const nowIso = new Date().toISOString()
    const inserts: any[] = []

  for (const t of (tenants ?? []) as any[]) {
    const tid = t.id as string
    const lc = lastContact.get(tid) ?? null
    const lo = lastOrder.get(tid) ?? null
    const lr = lastRfq.get(tid) ?? null
    const la = lastActivityDay(tid)
    if (la && la >= d90) continue
    if (existing.has(tid)) continue

    inserts.push({
      priority: 'normal',
      category: 'trade',
      title: `휴면 참여자 재활성: ${t.name ?? tid.slice(0, 8)}`,
      description: `활동 신호 90일 초과 (contact:${lc?.slice(0, 10) ?? '없음'}, order:${lo ?? '없음'}, rfq:${lr ?? '없음'})`,
      status: 'pending',
      action_options: {
        kind: 'dormant_reengage',
        tenant_id: tid,
        last_login_at: lc ?? null,
        last_trade_at: la ?? null,
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
  } catch (e: any) {
    return { success: false, error: e?.message ?? '휴면 감지 실패' }
  }
}

export async function getGrowthMetrics(): Promise<ActionResult<GrowthMetrics>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const day30 = isoDayStartDaysAgo(30)
    const sixMo = isoDayStartDaysAgo(185)

  const [
    tenantsNew,
    orders180,
    rfqRecent,
    restaurantMetrics,
  ] = await Promise.all([
    // FORENSIC-009: 신규 참여자 집계도 전체 기준(페이지네이션)
    fetchAllPaged<{ id: string; created_at: string }>(
      (from, to) =>
        supabase
          .from('tenants')
          .select('id, created_at')
          .gte('created_at', `${day30}T00:00:00.000Z`)
          .order('id', { ascending: true })
          .range(from, to),
      { pageSize: 5000 },
    ),
    // FORENSIC-009: 지표 집계는 전체 데이터를 기준으로 계산 (limit 샘플링 금지)
    fetchAllPaged<{
      order_date: string
      final_amount?: number | null
      total_amount?: number | null
      tenant_id: string | null
      seller_tenant_id: string | null
    }>(
      (from, to) =>
        supabase
          .from('orders')
          .select('order_date, final_amount, total_amount, tenant_id, seller_tenant_id')
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .gte('order_date', sixMo.slice(0, 10))
          .order('order_date', { ascending: true })
          .range(from, to),
      { pageSize: 5000 },
    ),
    fetchAllPaged<{ tenant_id: string | null; created_at: string }>(
      (from, to) =>
        supabase
          .from('rfq_requests')
          .select('tenant_id, created_at')
          .gte('created_at', `${day30}T00:00:00.000Z`)
          .order('created_at', { ascending: true })
          .range(from, to),
      { pageSize: 5000 },
    ),
    // 이탈 위험은 대시보드 카드와 같은 함수로 판정한다 — 여기서 다시 세지 않는다
    getRestaurantMetrics(),
  ])

  if (!restaurantMetrics.success) {
    return { success: false, error: restaurantMetrics.error }
  }
  const churn_risk_customers = restaurantMetrics.data.cycleRisk.count

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

  // 휴면 목록은 detectDormant와 동일 규칙으로 계산(삽입 없이 표시만)
  const d90 = isoDayStartDaysAgo(90)
  const [allTenants, allContacts, allOrders, allRfqs] = await Promise.all([
    fetchAllPaged<{ id: string; name: string | null }>(
      (from, to) => supabase.from('tenants').select('id, name').order('id', { ascending: true }).range(from, to),
      { pageSize: 5000 },
    ),
    fetchAllPaged<{ tenant_id: string | null; contacted_at: string | null }>(
      (from, to) =>
        supabase
          .from('contact_logs')
          .select('tenant_id, contacted_at')
          .not('tenant_id', 'is', null)
          .order('contacted_at', { ascending: false })
          .range(from, to),
      { pageSize: 5000 },
    ),
    fetchAllPaged<{ order_date: string; tenant_id: string | null; seller_tenant_id: string | null }>(
      (from, to) =>
        supabase
          .from('orders')
          .select('order_date, tenant_id, seller_tenant_id')
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .order('order_date', { ascending: false })
          .range(from, to),
      { pageSize: 5000 },
    ),
    fetchAllPaged<{ tenant_id: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('rfq_requests')
          .select('tenant_id, created_at')
          .not('tenant_id', 'is', null)
          .order('created_at', { ascending: false })
          .range(from, to),
      { pageSize: 5000 },
    ),
  ])

  const lastContactM = new Map<string, string>()
  for (const r of (allContacts ?? []) as any[]) {
    const tid = r.tenant_id as string | null
    const ca = r.contacted_at as string | null
    if (!tid || !ca) continue
    const prev = lastContactM.get(tid)
    if (!prev || ca > prev) lastContactM.set(tid, ca)
  }

  const lastOrderM = new Map<string, string>()
  for (const o of (allOrders ?? []) as any[]) {
    const od = o.order_date as string
    const sk = sellerKey(o)
    if (!sk || !od) continue
    const prev = lastOrderM.get(sk)
    if (!prev || od > prev) lastOrderM.set(sk, od)
  }

  const lastRfqM = new Map<string, string>()
  for (const r of (allRfqs ?? []) as any[]) {
    const tid = r.tenant_id as string | null
    const ca = r.created_at as string | null
    if (!tid || !ca) continue
    const day = ca.slice(0, 10)
    const prev = lastRfqM.get(tid)
    if (!prev || day > prev) lastRfqM.set(tid, day)
  }

  const lastActivityDayM = (tid: string) => {
    const c = lastContactM.get(tid)?.slice(0, 10) ?? null
    const o = lastOrderM.get(tid) ?? null
    const r = lastRfqM.get(tid) ?? null
    return [c, o, r].filter(Boolean).sort().at(-1) ?? null
  }

  const dormantRows: DormantTenantRow[] = []
  for (const t of (allTenants ?? []) as any[]) {
    const tid = t.id as string
    const lc = lastContactM.get(tid) ?? null
    const la = lastActivityDayM(tid)
    if (!la || la < d90) {
      dormantRows.push({
        tenant_id: tid,
        tenant_label: t.name ?? tid.slice(0, 8),
        last_login_at: lc ?? null,
        last_trade_at: la ?? null,
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
      churn_risk_customers,
      dormant: dormantRows.length,
    },
  }).catch(() => {})

    return {
      success: true,
      data: {
        new_participants_30d: (tenantsNew ?? []).length,
        active_participants_30d: activeTenants.size,
        churn_risk_customers,
        dormant_tenants: dormantRows.length,
        platform_gmv_30d: gmv30,
        monthly_gmv_trend,
        dormant_rows: dormantRows.slice(0, 80),
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message ?? '성장 지표 조회 실패' }
  }
}
