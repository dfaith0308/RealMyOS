'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getCustomersWithScore } from '@/actions/ledger'
import { getDailyFundPlan } from '@/actions/fund'
import {
  effectiveOrderAmount,
  isSalesOrder,
  buildCustomerKey,
  resolveCustomerName,
} from '@/lib/ledger-calc'
import type { ActionResult } from '@/types/order'

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function monthStartKST(): string {
  const d = new Date(Date.now() + 9 * 3600000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export interface DashboardData {
  total_receivable:   number
  total_deposit:      number
  monthly_sales:      number
  total_overdue:      number
  top_customers: Array<{
    id: string; name: string; score: number; primary_reason: string; status: string
  }>
  top_customer_sales: Array<{ name: string; amount: number }>
  top_product_sales:  Array<{ name: string; amount: number }>
  overdue_count:      number
  uncontacted_count:  number
  draft_order_count:  number
  fund_total_planned: number
  fund_total_actual:  number
  fund_pending_count: number
  ai_context: {
    overdue_count: number; top_score: number; top_score_name: string
    max_days_contact: number; receivable_amount: number
  }
}

export async function getDashboardData(): Promise<ActionResult<DashboardData>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const today      = todayKST()
  const monthStart = monthStartKST()
  const tid        = ctx.tenant_id

  const [
    scoreResult,
    fundResult,
    { data: monthlySalesRaw },
    { data: customerSalesRaw },
    { data: ordersForProductSales },
    { data: draftOrders },
  ] = await Promise.all([
    getCustomersWithScore(),
    getDailyFundPlan(today),

    supabase.from('orders')
      .select('total_amount, final_amount, order_type')
      .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .in('status', ['confirmed', 'delivered'])
      .is('deleted_at', null)
      .gte('order_date', monthStart).lte('order_date', today),

    supabase.from('orders')
      .select('customer_id, customer_name, total_amount, final_amount, order_type, customers(name)')
      .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .in('status', ['confirmed', 'delivered'])
      .is('deleted_at', null)
      .gte('order_date', monthStart).lte('order_date', today),

    supabase.from('orders')
      .select('order_lines(product_name, line_total), order_type')
      .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .in('status', ['confirmed', 'delivered'])
      .is('deleted_at', null)
      .gte('order_date', monthStart).lte('order_date', today),

    supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .eq('status', 'draft')
      .is('deleted_at', null),
  ])

  const customers = scoreResult.data ?? []

  // KPI
  const total_receivable = customers.reduce((s, c) => s + Math.max(0, c.receivable_amount), 0)
  const total_deposit    = 0  // 예치금 기능 미완성 — 항상 0
  const total_overdue    = customers.reduce((s, c) => s + c.overdue_amount, 0)
  const monthly_sales    = (monthlySalesRaw ?? [])
    .filter((o) => isSalesOrder(o))
    .reduce((s, o) => s + effectiveOrderAmount(o), 0)

  // 위험 거래처 TOP5
  const top_customers = customers.slice(0, 5).map((c) => {
    let primary_reason = ''
    if (c.overdue_amount > 0)
      primary_reason = `연체금 ${Math.round(c.overdue_amount / 10000)}만원`
    else if ((c.days_since_contact ?? 0) >= 7)
      primary_reason = `${c.days_since_contact}일 미연락`
    else if (
      c.days_since_order !== null &&
      (c.order_cycle_days ?? 0) > 0 &&
      c.days_since_order > (c.order_cycle_days ?? 0)
    )
      primary_reason = '주문주기 초과'
    else if (c.receivable_amount > 0)
      primary_reason = `미수금 ${Math.round(c.receivable_amount / 10000)}만원`
    return { id: c.id, name: c.name, score: c.action_score, primary_reason, status: c.status }
  })

  // 거래처 매출 TOP5 — customer_name snapshot 우선, purchase 제외
  const custSalesMap = new Map<string, { name: string; amount: number }>()
  for (const o of customerSalesRaw ?? []) {
    if (!isSalesOrder(o)) continue
    const key  = buildCustomerKey(o)
    const name = resolveCustomerName(o as { customer_name?: string | null; customers?: { name?: string | null } | null })
    const amt  = effectiveOrderAmount(o)
    const cur  = custSalesMap.get(key) ?? { name, amount: 0 }
    custSalesMap.set(key, { name, amount: cur.amount + amt })
  }
  const top_customer_sales = [...custSalesMap.values()]
    .sort((a, b) => b.amount - a.amount).slice(0, 5)

  // 상품 매출 TOP5 — purchase 제외
  const prodSalesMap = new Map<string, number>()
  for (const o of ordersForProductSales ?? []) {
    if (!isSalesOrder(o)) continue
    for (const l of (o as any).order_lines ?? [])
      prodSalesMap.set(l.product_name, (prodSalesMap.get(l.product_name) ?? 0) + l.line_total)
  }
  const top_product_sales = [...prodSalesMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, amount]) => ({ name, amount }))

  const overdue_count     = customers.filter((c) => c.overdue_amount > 0).length
  const uncontacted_count = customers.filter((c) => (c.days_since_contact ?? 0) >= 14).length
  const draft_order_count = (draftOrders as any)?.count ?? 0

  const fundPlan           = fundResult.data ?? []
  const fund_total_planned = fundPlan.reduce((s, f) => s + f.planned_amount, 0)
  const fund_total_actual  = fundPlan.filter((f) => f.actual_amount !== null)
    .reduce((s, f) => s + (f.actual_amount ?? 0), 0)
  const fund_pending_count = fundPlan.filter((f) => f.status === 'pending').length

  const top1 = customers[0]
  const ai_context = {
    overdue_count,
    top_score:        top1?.action_score ?? 0,
    top_score_name:   top1?.name ?? '',
    max_days_contact: Math.max(0, ...customers.map((c) => c.days_since_contact ?? 0)),
    receivable_amount: total_receivable,
  }

  return {
    success: true,
    data: {
      total_receivable, total_deposit, monthly_sales, total_overdue,
      top_customers, top_customer_sales, top_product_sales,
      overdue_count, uncontacted_count, draft_order_count,
      fund_total_planned, fund_total_actual, fund_pending_count,
      ai_context,
    },
  }
}

function fallbackMessage(ctx: DashboardData['ai_context']): string {
  if (ctx.overdue_count > 0)
    return `사장님, 연체 거래처가 ${ctx.overdue_count}곳입니다. 오늘 ${ctx.top_score_name}에 먼저 연락해보세요.`
  if (ctx.max_days_contact >= 14)
    return `사장님, ${ctx.max_days_contact}일 이상 연락이 없는 거래처가 있습니다. 오늘 미연락 거래처부터 확인하세요.`
  if (ctx.receivable_amount > 0)
    return `사장님, 미수금 ${Math.round(ctx.receivable_amount / 10000)}만원이 있습니다. 오늘 미수금과 자금계획부터 확인하세요.`
  return '사장님, 오늘은 매출 현황과 자금계획을 확인하고 하루를 시작하세요.'
}

export async function getAiInsight(ctx: DashboardData['ai_context']): Promise<string> {
  try {
    const prompt = `당신은 한국 식품 도매 유통업 사장의 비서입니다.
아래 데이터를 보고 딱 1문장으로 오늘의 핵심 행동을 알려주세요.
형식: "사장님, {상황 요약}. 오늘 {구체적 행동 1가지} 해보세요."
데이터:
- 연체 거래처 수: ${ctx.overdue_count}곳
- 최우선 거래처: ${ctx.top_score_name} (점수 ${ctx.top_score})
- 최장 미연락: ${ctx.max_days_contact}일
- 총 미수금: ${Math.round(ctx.receivable_amount / 10000)}만원
규칙: 반드시 1문장, 50자 이내, 구체적인 행동 포함`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    return data.content?.[0]?.text?.trim() ?? fallbackMessage(ctx)
  } catch {
    return fallbackMessage(ctx)
  }
}

export interface CollectionTarget {
  id: string; name: string; current_balance: number
  last_payment_date: string | null; days_since_payment: number | null
}

export async function getTodayCollections(): Promise<ActionResult<CollectionTarget[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const tid      = ctx.tenant_id

  const [{ data: customers }, { data: orders }, { data: payments }] = await Promise.all([
    supabase.from('customers').select('id, name, opening_balance')
      .eq('tenant_id', tid).is('deleted_at', null),
    supabase.from('orders')
      .select('customer_id, customer_name, final_amount, total_amount, order_type')
      .or(`seller_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .in('status', ['confirmed', 'delivered'])
      .is('deleted_at', null),
    supabase.from('payments').select('customer_id, amount, payment_date')
      .or(`payee_tenant_id.eq.${tid},tenant_id.eq.${tid}`)
      .eq('direction', 'inbound').eq('status', 'confirmed'),
  ])

  // customer_name → id 역매핑 (동명이인 제외)
  const nameToId = new Map<string, string>()
  const nameDups = new Set<string>()
  for (const c of customers ?? []) {
    if (nameToId.has(c.name)) nameDups.add(c.name)
    else nameToId.set(c.name, c.id)
  }

  const finalMap   = new Map<string, number>()
  const payMap     = new Map<string, number>()
  const lastPayMap = new Map<string, string>()

  for (const o of orders ?? []) {
    if (!isSalesOrder(o)) continue
    let cid = o.customer_id
    if (!cid && o.customer_name) {
      if (nameDups.has(o.customer_name)) {
        console.warn(`[getTodayCollections] 동명이인 제외: ${o.customer_name}`)
        continue
      }
      cid = nameToId.get(o.customer_name) ?? null
    }
    if (!cid) continue
    finalMap.set(cid, (finalMap.get(cid) ?? 0) + effectiveOrderAmount(o))
  }

  for (const p of payments ?? []) {
    if (!p.customer_id) continue
    payMap.set(p.customer_id, (payMap.get(p.customer_id) ?? 0) + p.amount)
    const prev = lastPayMap.get(p.customer_id)
    if (!prev || p.payment_date > prev) lastPayMap.set(p.customer_id, p.payment_date)
  }

  const result: CollectionTarget[] = []
  for (const c of customers ?? []) {
    const balance = (c.opening_balance ?? 0) + (finalMap.get(c.id) ?? 0) - (payMap.get(c.id) ?? 0)
    if (balance <= 0) continue
    const lastPay   = lastPayMap.get(c.id) ?? null
    const daysSince = lastPay
      ? Math.floor((new Date(todayStr).getTime() - new Date(lastPay).getTime()) / 86400000)
      : null
    if (daysSince !== null && daysSince < 3) continue
    result.push({ id: c.id, name: c.name, current_balance: balance, last_payment_date: lastPay, days_since_payment: daysSince })
  }

  result.sort((a, b) => b.current_balance - a.current_balance)
  return { success: true, data: result.slice(0, 5) }
}
