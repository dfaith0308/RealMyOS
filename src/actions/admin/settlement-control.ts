'use server'

import { revalidatePath } from 'next/cache'
import { ensurePolicyDefaults } from '@/actions/admin/policy-console'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { fetchInboundSupersededSubset } from '@/lib/inbound-payment-superseded'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

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

/** 정책 콘솔 SSOT 시드로 수수료·정산 주기 키 포함 */
export async function ensureAdminSettingsDefaultsForSettlement(): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const res = await ensurePolicyDefaults(supabase, { adminUserId: auth.ctx.user_id })
  if (!res.success) return { success: false, error: res.error ?? '시드 실패' }

  return { success: true }
}

async function loadFeePercentNumerator(supabase: any): Promise<ActionResult<number>> {
  const seed = await ensureAdminSettingsDefaultsForSettlement()
  if (!seed.success) return { success: false, error: seed.error }

  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', 'platform_fee_rate').maybeSingle()

  if (error) return { success: false, error: error.message }
  const n = Number((data as any)?.value)
  if (!Number.isFinite(n) || n < 0) return { success: false, error: 'platform_fee_rate 설정값이 유효하지 않습니다.' }
  return { success: true, data: n }
}

async function loadSettlementCycleDays(supabase: any): Promise<ActionResult<number>> {
  const seed = await ensureAdminSettingsDefaultsForSettlement()
  if (!seed.success) return { success: false, error: seed.error }

  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', 'settlement_cycle_days').maybeSingle()

  if (error) return { success: false, error: error.message }
  const n = Number((data as any)?.value)
  if (!Number.isFinite(n) || n <= 0) return { success: false, error: 'settlement_cycle_days 설정값이 유효하지 않습니다.' }
  return { success: true, data: Math.floor(n) }
}

function orderAmount(o: { final_amount?: number | null; total_amount?: number | null }) {
  const f = o.final_amount
  const t = o.total_amount
  if (typeof f === 'number' && Number.isFinite(f)) return f
  if (typeof t === 'number' && Number.isFinite(t)) return t
  return 0
}

function kstTodayDateString() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function monthRangeUtcNow() {
  const k = new Date(Date.now() + 9 * 3600000)
  const y = k.getUTCFullYear()
  const m = k.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { start, end }
}

export interface PlatformRevenue {
  month_gmv: number
  month_fee_amount: number
  pending_settlement_amount: number
  month_settled_amount: number
  fee_percent_label: string
}

export interface PendingSettlementRow {
  order_id: string
  order_number: string
  order_date: string
  seller_tenant_id: string
  customer_id: string
  customer_name: string
  amount: number
  days_pending: number
  overdue_risk: boolean
}

export interface PendingSettlementSummary {
  cycle_days: number
  rows: PendingSettlementRow[]
  by_customer: Array<{ customer_id: string; customer_name: string; seller_tenant_id: string; total_pending: number; order_count: number }>
}

export interface SettlementHistoryRow {
  id: string
  created_at: string
  order_id: string | null
  amount: number
  status: string
  memo: string | null
}

export type UnifiedSettlementStatus = '정산완료' | '부분정산' | '미정산'

export interface UnifiedSettlementOrderRow {
  order_id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  seller_tenant_id: string
  order_amount: number
  paid_amount: number
  settled_amount: number
  remaining_balance: number
  days_pending: number
  status_label: UnifiedSettlementStatus
  is_over_30_days: boolean
}

export interface UnifiedSettlementCustomerGroup {
  customer_id: string
  customer_name: string
  seller_tenant_id: string
  total_order_amount: number
  total_paid_amount: number
  total_settled_amount: number
  total_remaining_balance: number
  orders: UnifiedSettlementOrderRow[]
}

export interface CreditLineRow {
  tenant_id: string
  tenant_name: string | null
  role: 'restaurant' | 'supplier'
  score: number
  computed_credit_line: number
  override_credit_line: number | null
  effective_credit_line: number
}

export interface SettlementSuggestionRow {
  order_id: string
  order_number: string
  order_date: string
  customer_id: string
  customer_name: string
  seller_tenant_id: string
  amount: number
  days_pending: number
}

export async function getPlatformRevenue(): Promise<ActionResult<PlatformRevenue>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const feeRes = await loadFeePercentNumerator(supabase)
  if (!feeRes.success || feeRes.data == null) return { success: false, error: feeRes.error ?? '수수료율 조회 실패' }
  const feePct = feeRes.data

  const { start, end } = monthRangeUtcNow()

  const [{ data: monthOrders, error: moErr }, { data: pendingOrders, error: poErr }, { data: settledPay, error: spErr }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id, order_date, final_amount, total_amount')
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .gte('order_date', start)
        .lte('order_date', end)
        .limit(25000),
      supabase
        .from('orders')
        .select('id, final_amount, total_amount')
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .limit(25000),
      supabase
        .from('payments')
        .select('amount, status, created_at, type')
        .eq('type', 'settlement')
        .eq('status', 'confirmed')
        .gte('created_at', `${start}T00:00:00.000Z`)
        .lte('created_at', `${end}T23:59:59.999Z`)
        .limit(25000),
    ])

  if (moErr) return { success: false, error: moErr.message }
  if (poErr) return { success: false, error: poErr.message }
  if (spErr) return { success: false, error: spErr.message }

  const month_gmv = (monthOrders ?? []).reduce((s: number, o: any) => s + orderAmount(o), 0)
  const month_fee_amount = Math.round((month_gmv * feePct) / 100)

  const { data: settledOrderIdsRows } = await supabase
    .from('payments')
    .select('order_id')
    .eq('type', 'settlement')
    .eq('status', 'confirmed')
    .not('order_id', 'is', null)
    .limit(25000)

  const settledIds = new Set((settledOrderIdsRows ?? []).map((r: any) => r.order_id).filter(Boolean))

  const pending_settlement_amount = (pendingOrders ?? [])
    .filter((o: any) => !settledIds.has(o.id))
    .reduce((s: number, o: any) => s + orderAmount(o), 0)

  const month_settled_amount = (settledPay ?? []).reduce((s: number, p: any) => s + (typeof p.amount === 'number' ? p.amount : 0), 0)

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_revenue_view',
    target_table: 'settlements',
    new_value: { month_start: start, month_end: end },
  }).catch(() => {})

  return {
    success: true,
    data: {
      month_gmv,
      month_fee_amount,
      pending_settlement_amount,
      month_settled_amount,
      fee_percent_label: String(feePct),
    },
  }
}

export async function getPendingSettlements(): Promise<ActionResult<PendingSettlementSummary>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const cycRes = await loadSettlementCycleDays(supabase)
  if (!cycRes.success || cycRes.data == null) return { success: false, error: cycRes.error ?? '정산 주기 조회 실패' }
  const cycle_days = cycRes.data

  const { data: settledRows } = await supabase
    .from('payments')
    .select('order_id')
    .eq('type', 'settlement')
    .eq('status', 'confirmed')
    .not('order_id', 'is', null)
    .limit(25000)

  const settled = new Set((settledRows ?? []).map((r: any) => r.order_id).filter(Boolean))

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, tenant_id, seller_tenant_id, final_amount, total_amount')
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .limit(800)

  if (oErr) return { success: false, error: oErr.message }

  const today = kstTodayDateString()
  const rows: PendingSettlementRow[] = []

  const pendingOrders = (orders ?? []).filter((o: any) => !settled.has(o.id))
  const custIds = [...new Set(pendingOrders.map((o: any) => o.customer_id).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (custIds.length) {
    const { data: cn } = await supabase.from('customers').select('id, name').in('id', custIds).limit(2000)
    for (const c of (cn ?? []) as any[]) nameMap.set(c.id, c.name ?? '-')
  }

  const custAgg = new Map<string, { customer_name: string; seller_tenant_id: string; total_pending: number; order_count: number }>()

  for (const o of pendingOrders) {
    const seller = String((o as any).seller_tenant_id ?? (o as any).tenant_id ?? '')
    const amt = orderAmount(o as any)
    const od = String((o as any).order_date).slice(0, 10)
    let days_pending = Math.floor((new Date(today).getTime() - new Date(od).getTime()) / 86400000)
    if (!Number.isFinite(days_pending) || days_pending < 0) days_pending = 0

    const cid = (o as any).customer_id as string
    rows.push({
      order_id: (o as any).id,
      order_number: (o as any).order_number,
      order_date: od,
      seller_tenant_id: seller,
      customer_id: cid,
      customer_name: nameMap.get(cid) ?? '-',
      amount: amt,
      days_pending,
      overdue_risk: days_pending > cycle_days,
    })

    const ck = `${seller}:${cid}`
    const prev = custAgg.get(ck)
    if (!prev) {
      custAgg.set(ck, {
        customer_name: nameMap.get(cid) ?? '-',
        seller_tenant_id: seller,
        total_pending: amt,
        order_count: 1,
      })
    } else {
      prev.total_pending += amt
      prev.order_count += 1
    }
  }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_pending_view',
    target_table: 'orders',
    new_value: { pending_count: rows.length, cycle_days },
  }).catch(() => {})

  return {
    success: true,
    data: {
      cycle_days,
      rows,
      by_customer: [...custAgg.entries()].map(([key, v]) => ({
        customer_id: key.split(':')[1] ?? '',
        customer_name: v.customer_name,
        seller_tenant_id: v.seller_tenant_id,
        total_pending: v.total_pending,
        order_count: v.order_count,
      })),
    },
  }
}

export async function getSettlementHistory(): Promise<ActionResult<SettlementHistoryRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('payments')
    .select('id, created_at, order_id, amount, status, memo, settlement_memo')
    .eq('type', 'settlement')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { success: false, error: error.message }

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_history_view',
    target_table: 'payments',
  }).catch(() => {})

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      order_id: r.order_id ?? null,
      amount: typeof r.amount === 'number' ? r.amount : 0,
      status: String(r.status ?? ''),
      memo: (r.settlement_memo ?? r.memo) != null ? String(r.settlement_memo ?? r.memo) : null,
    })) as SettlementHistoryRow[],
  }
}

export async function getUnifiedSettlementView(): Promise<ActionResult<{ rows: UnifiedSettlementOrderRow[]; by_customer: UnifiedSettlementCustomerGroup[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, tenant_id, seller_tenant_id, status, final_amount, total_amount')
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .limit(1200)

  if (oErr) return { success: false, error: oErr.message }

  const orderRows = (orders ?? []) as any[]
  const orderIds = orderRows.map((o) => o.id).filter(Boolean)
  if (orderIds.length === 0) return { success: true, data: { rows: [], by_customer: [] } }

  const custIds = [...new Set(orderRows.map((o) => o.customer_id).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (custIds.length) {
    const { data: cn } = await supabase.from('customers').select('id, name').in('id', custIds).limit(5000)
    for (const c of (cn ?? []) as any[]) nameMap.set(String(c.id), c.name ?? '-')
  }

  // payments for these orders
  const [{ data: pays, error: pErr }, { data: settles, error: sErr }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, order_id, amount, status, direction, type')
      .in('order_id', orderIds)
      .eq('status', 'confirmed')
      .neq('type', 'settlement')
      .eq('direction', 'inbound')
      .limit(25000),
    supabase
      .from('payments')
      .select('order_id, amount, status, type')
      .in('order_id', orderIds)
      .eq('status', 'confirmed')
      .eq('type', 'settlement')
      .limit(25000),
  ])
  if (pErr) return { success: false, error: pErr.message }
  if (sErr) return { success: false, error: sErr.message }

  const payList = (pays ?? []) as Array<{ id?: string; order_id?: string; amount?: number }>
  const supersededInbound = await fetchInboundSupersededSubset(
    supabase,
    payList.map((p) => String(p.id ?? '')).filter(Boolean),
  )
  const supersedeSet = new Set(supersededInbound)

  const paidByOrder = new Map<string, number>()
  for (const p of payList) {
    if (supersedeSet.has(String(p.id ?? ''))) continue
    const oid = String(p.order_id ?? '')
    if (!oid) continue
    const amt = typeof p.amount === 'number' ? p.amount : 0
    paidByOrder.set(oid, (paidByOrder.get(oid) ?? 0) + amt)
  }

  const settledByOrder = new Map<string, number>()
  for (const p of (settles ?? []) as any[]) {
    const oid = String(p.order_id ?? '')
    if (!oid) continue
    const amt = typeof p.amount === 'number' ? p.amount : 0
    settledByOrder.set(oid, (settledByOrder.get(oid) ?? 0) + amt)
  }

  const today = kstTodayDateString()
  const rows: UnifiedSettlementOrderRow[] = orderRows.map((o) => {
    const order_id = String(o.id)
    const seller = String(o.seller_tenant_id ?? o.tenant_id ?? '')
    const order_date = String(o.order_date).slice(0, 10)
    let days_pending = Math.floor((new Date(today).getTime() - new Date(order_date).getTime()) / 86400000)
    if (!Number.isFinite(days_pending) || days_pending < 0) days_pending = 0

    const order_amount = orderAmount(o)
    const paid_amount = paidByOrder.get(order_id) ?? 0
    const settled_amount = settledByOrder.get(order_id) ?? 0
    const remaining_balance = Math.max(0, Math.round(order_amount - paid_amount - settled_amount))

    const status_label: UnifiedSettlementStatus =
      remaining_balance <= 0 ? '정산완료' : (paid_amount > 0 || settled_amount > 0) ? '부분정산' : '미정산'

    return {
      order_id,
      order_number: String(o.order_number ?? order_id),
      order_date,
      customer_id: String(o.customer_id ?? ''),
      customer_name: nameMap.get(String(o.customer_id ?? '')) ?? '-',
      seller_tenant_id: seller,
      order_amount,
      paid_amount,
      settled_amount,
      remaining_balance,
      days_pending,
      status_label,
      is_over_30_days: days_pending > 30 && remaining_balance > 0,
    }
  })

  const byCustomer = new Map<string, UnifiedSettlementCustomerGroup>()
  for (const r of rows) {
    const k = `${r.seller_tenant_id}:${r.customer_id}`
    const ex = byCustomer.get(k)
    if (!ex) {
      byCustomer.set(k, {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        seller_tenant_id: r.seller_tenant_id,
        total_order_amount: r.order_amount,
        total_paid_amount: r.paid_amount,
        total_settled_amount: r.settled_amount,
        total_remaining_balance: r.remaining_balance,
        orders: [r],
      })
    } else {
      ex.total_order_amount += r.order_amount
      ex.total_paid_amount += r.paid_amount
      ex.total_settled_amount += r.settled_amount
      ex.total_remaining_balance += r.remaining_balance
      ex.orders.push(r)
    }
  }

  const groups = [...byCustomer.values()].sort((a, b) => b.total_remaining_balance - a.total_remaining_balance)

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_unified_view',
    target_table: 'orders/payments',
    new_value: { order_count: rows.length, customer_groups: groups.length },
  }).catch(() => {})

  return { success: true, data: { rows, by_customer: groups } }
}

export async function getCreditLines(): Promise<ActionResult<CreditLineRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: ts, error } = await supabase
    .from('trust_scores')
    .select('tenant_id, role, score, updated_at')
    .in('role', ['restaurant', 'supplier'])
    .limit(2000)
  if (error) return { success: false, error: error.message }

  const tenantIds = [...new Set((ts ?? []).map((r: any) => String(r.tenant_id)).filter(Boolean))]
  const { data: tenants } = tenantIds.length
    ? await supabase.from('tenants').select('id, name').in('id', tenantIds).limit(3000)
    : { data: [] as any[] }
  const nameMap = new Map((tenants ?? []).map((t: any) => [String(t.id), t.name ?? null]))

  // overrides: admin_settings.credit_line_{tenant_id}
  const overrideKeys = tenantIds.map((id) => `credit_line_${id}`)
  const { data: overrides } = overrideKeys.length
    ? await supabase.from('admin_settings').select('key, value').in('key', overrideKeys).limit(3000)
    : { data: [] as any[] }
  const ovMap = new Map((overrides ?? []).map((r: any) => [String(r.key), String(r.value ?? '')]))

  const out: CreditLineRow[] = (ts ?? []).map((r: any) => {
    const score = typeof r.score === 'number' ? r.score : 0
    const computed = Math.max(0, Math.round(score * 10000))
    const k = `credit_line_${String(r.tenant_id)}`
    const ovRaw = ovMap.get(k)
    const ovNum = ovRaw != null && ovRaw.trim() ? Math.floor(Number(ovRaw)) : NaN
    const override_credit_line = Number.isFinite(ovNum) ? Math.max(0, ovNum) : null
    const effective = override_credit_line ?? computed
    return {
      tenant_id: String(r.tenant_id),
      tenant_name: nameMap.get(String(r.tenant_id)) ?? null,
      role: r.role === 'supplier' ? 'supplier' : 'restaurant',
      score,
      computed_credit_line: computed,
      override_credit_line,
      effective_credit_line: effective,
    }
  })

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'credit_line_view',
    target_table: 'trust_scores/admin_settings',
    new_value: { rows: out.length },
  }).catch(() => {})

  return { success: true, data: out }
}

export async function setCreditLineOverride(tenant_id: string, value: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!tenant_id?.trim()) return { success: false, error: 'tenant_id가 올바르지 않습니다.' }

  const n = Math.floor(Number((value ?? '').replace(/[^0-9]/g, '')))
  if (!Number.isFinite(n) || n < 0) return { success: false, error: '유효한 금액(숫자)을 입력해 주세요.' }

  const key = `credit_line_${tenant_id}`
  const { data: beforeRow } = await supabase.from('admin_settings').select('value').eq('key', key).maybeSingle()
  const beforeVal = beforeRow?.value != null ? String((beforeRow as any).value) : null

  const nowIso = new Date().toISOString()
  const { error } = await supabase.from('admin_settings').upsert(
    {
      key,
      value: String(n),
      description: '신용한도 override (FORENSIC-003-C)',
      updated_at: nowIso,
      updated_by: auth.ctx.user_id,
    },
    { onConflict: 'key' },
  )
  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'credit_line_override_set',
    target_table: 'admin_settings',
    target_id: key,
    old_value: { key, before_value: beforeVal },
    new_value: { key, after_value: String(n) },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/settlements')
  return { success: true }
}

export async function getAutoSettlementSuggestions(): Promise<ActionResult<SettlementSuggestionRow[]>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const today = kstTodayDateString()

  const { data: settledRows, error: sErr } = await supabase
    .from('payments')
    .select('order_id')
    .eq('type', 'settlement')
    .eq('status', 'confirmed')
    .not('order_id', 'is', null)
    .limit(25000)
  if (sErr) return { success: false, error: sErr.message }

  const settled = new Set((settledRows ?? []).map((r: any) => r.order_id).filter(Boolean))

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, order_date, customer_id, tenant_id, seller_tenant_id, final_amount, total_amount')
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .limit(1500)
  if (oErr) return { success: false, error: oErr.message }

  const candidates = (orders ?? []).filter((o: any) => !settled.has(o.id))
  const over30: any[] = []
  for (const o of candidates) {
    const od = String(o.order_date).slice(0, 10)
    let days = Math.floor((new Date(today).getTime() - new Date(od).getTime()) / 86400000)
    if (!Number.isFinite(days) || days < 0) days = 0
    if (days > 30) over30.push({ ...o, _days: days })
  }

  const custIds = [...new Set(over30.map((o) => o.customer_id).filter(Boolean))]
  const nameMap = new Map<string, string>()
  if (custIds.length) {
    const { data: cn } = await supabase.from('customers').select('id, name').in('id', custIds).limit(5000)
    for (const c of (cn ?? []) as any[]) nameMap.set(String(c.id), c.name ?? '-')
  }

  const rows: SettlementSuggestionRow[] = over30.map((o: any) => ({
    order_id: o.id,
    order_number: o.order_number,
    order_date: String(o.order_date).slice(0, 10),
    customer_id: o.customer_id,
    customer_name: nameMap.get(String(o.customer_id)) ?? '-',
    seller_tenant_id: String(o.seller_tenant_id ?? o.tenant_id ?? ''),
    amount: orderAmount(o),
    days_pending: o._days,
  }))

  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_suggestions_view',
    target_table: 'orders/payments',
    new_value: { count: rows.length },
  }).catch(() => {})

  return { success: true, data: rows }
}

async function completeRelatedActionQueue(supabase: any, adminId: string, orderId: string) {
  const nowIso = new Date().toISOString()
  const { data: aq } = await supabase
    .from('action_queue')
    .select('id, action_options')
    .in('status', ['pending', 'in_progress'])
    .limit(600)

  const ids = (aq ?? [])
    .filter((r: any) => r.action_options?.order_id === orderId)
    .map((r: any) => r.id)

  if (!ids.length) return

  const { error } = await supabase
    .from('action_queue')
    .update({
      status: 'completed',
      resolved_at: nowIso,
      resolved_by: adminId,
    })
    .in('id', ids)

  if (error) throw new Error(error.message)
}

export async function processSettlement(order_id: string, settlement_memo?: string | null): Promise<ActionResult<{ payment_id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (!order_id?.trim()) return { success: false, error: 'order_id가 올바르지 않습니다.' }

  const feeRes = await loadFeePercentNumerator(supabase)
  if (!feeRes.success || feeRes.data == null) return { success: false, error: feeRes.error ?? '수수료율 조회 실패' }
  const feePct = feeRes.data

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, order_number, status, tenant_id, seller_tenant_id, final_amount, total_amount')
    .eq('id', order_id)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!order || (order as any).status !== 'confirmed') return { success: false, error: '확정 주문만 정산할 수 있습니다.' }

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('type', 'settlement')
    .eq('status', 'confirmed')
    .eq('order_id', order_id)
    .maybeSingle()

  if (existing?.id) return { success: false, error: '이미 정산 완료된 주문입니다.' }

  const sellerTenantId = String((order as any).seller_tenant_id ?? (order as any).tenant_id ?? '')
  if (!sellerTenantId) return { success: false, error: '주문에 공급자 테넌트가 없습니다.' }

  const base = orderAmount(order as any)
  const feeAmount = Math.round((base * feePct) / 100)
  if (feeAmount <= 0) return { success: false, error: '정산 수수료 금액이 0 이하입니다.' }

  const today = kstTodayDateString()

  const payload: Record<string, unknown> = {
    tenant_id: sellerTenantId,
    payer_tenant_id: sellerTenantId,
    payee_tenant_id: null,
    counterparty_name: '플랫폼 정산(수수료)',
    amount: feeAmount,
    payment_date: today,
    due_date: today,
    payment_method: 'platform',
    memo: `플랫폼 수수료 정산 — 주문 ${(order as any).order_number ?? order_id}`,
    settlement_memo: settlement_memo ? String(settlement_memo).slice(0, 500) : null,
    status: 'confirmed',
    direction: 'inbound',
    deposit_amount: 0,
    order_id,
    created_by: auth.ctx.user_id,
    type: 'settlement',
  }

  const { data: inserted, error: pErr } = await supabase.from('payments').insert(payload).select('id').single()

  if (pErr) return { success: false, error: pErr.message }

  await completeRelatedActionQueue(supabase, auth.ctx.user_id, order_id)

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'settlement_process',
    tenant_id: null,
    reason: 'manual settlement button',
    target_table: 'payments',
    target_id: inserted?.id ?? null,
    old_value: { order_id },
    new_value: { payment_id: inserted?.id, fee_percent_used: feePct, fee_amount: feeAmount, settlement_memo: settlement_memo ?? null },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  revalidatePath('/admin/settlements')
  return { success: true, data: { payment_id: inserted!.id as string } }
}
