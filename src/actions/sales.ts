'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import type { ContactResult, NextActionType } from '@/actions/contact'

// ============================================================
// 타입
// ============================================================

export interface SalesTarget {
  customer_id:             string
  customer_name:           string
  phone:                   string | null
  score:                   number
  overdue_amount:          number
  days_since_last_order:   number
  avg_order_cycle:         number
  days_since_last_contact: number | null
  next_action_date:        string | null
  next_action_type:        string | null
  last_contact_result:     string | null
}

export interface SalesScript {
  id:         string
  type:       'call' | 'message' | 'visit'
  title:      string
  content:    string
  is_default: boolean
  sort_order: number
}

export interface SalesHistory {
  id:               string
  customer_id:      string
  customer_name:    string
  contact_method:   string
  result:           string | null
  memo:             string | null
  next_action_date: string | null
  next_action_type: string | null
  contacted_at:     string
}

export interface SalesSchedule {
  id:             string
  customer_id:    string
  customer_name:  string
  scheduled_date: string
  action_type:    'call' | 'message' | 'visit'
  script_id:      string | null
  status:         'pending' | 'done' | 'snoozed' | 'cancelled'
  snooze_count:   number
  original_date:  string | null
  memo:           string | null
}

// ============================================================
// STEP 2. 점수 계산 — 구간 방식
// score ∈ [0, 100]
// ============================================================

function calculateScore(opts: {
  overdue_amount:          number
  days_since_last_order:   number
  avg_order_cycle:         number   // 고객별 최근 3개월 평균 주문 간격
  days_since_last_contact: number | null
}): number {
  let score = 0

  // 1. 연체금 구간 (max 50)
  if      (opts.overdue_amount >= 1_000_000) score += 50
  else if (opts.overdue_amount >= 500_000)   score += 30
  else if (opts.overdue_amount >= 100_000)   score += 15
  else if (opts.overdue_amount > 0)          score += 5

  // 2. 주문 공백 = 마지막주문일 - 평균주기 초과분 (max 30)
  const overdueDays = Math.max(0, opts.days_since_last_order - opts.avg_order_cycle)
  score += Math.min(overdueDays * 2, 30)

  // 3. 연락 공백 (max 20)
  const contactDays = opts.days_since_last_contact ?? 30
  score += Math.min(contactDays, 20)

  return score
}

// ============================================================
// 영업 스케쥴 (실시간 계산)
// ============================================================

export async function getSalesTargets(): Promise<ActionResult<SalesTarget[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const today    = new Date(todayStr + 'T00:00:00Z')
  const d90ago   = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10)

  const [
    { data: customers },
    { data: orders },
    { data: payments },
    { data: contacts },
    { data: recent90 },   // avg_order_cycle 계산용
  ] = await Promise.all([
    supabase.from('customers')
      .select('id, name, phone, payment_terms_days, opening_balance')
      .eq('tenant_id', ctx.tenant_id).eq('is_buyer', true).is('deleted_at', null),

    supabase.from('orders')
      .select('customer_id, total_amount, point_used, order_date')
      .eq('tenant_id', ctx.tenant_id).eq('status', 'confirmed').is('deleted_at', null)
      .order('order_date', { ascending: false }),

    supabase.from('payments')
      .select('customer_id, amount')
      .eq('tenant_id', ctx.tenant_id).eq('status', 'confirmed'),

    supabase.from('contact_logs')
      .select('customer_id, contacted_at, result, next_action_date, next_action_type')
      .eq('tenant_id', ctx.tenant_id)
      .order('contacted_at', { ascending: false }),

    // avg_order_cycle: 최근 90일 주문 날짜만
    supabase.from('orders')
      .select('customer_id, order_date')
      .eq('tenant_id', ctx.tenant_id).eq('status', 'confirmed').is('deleted_at', null)
      .gte('order_date', d90ago)
      .order('order_date', { ascending: true }),
  ])

  // ── 집계 맵 ──────────────────────────────────────────────

  // per-order (overdue 계산용)
  const orderRowsMap = new Map<string, Array<{ order_date: string; total_amount: number; point_used: number }>>()
  // summary (lastDate)
  const orderMap     = new Map<string, { lastDate: string }>()
  const payMap       = new Map<string, number>()
  const contactMap   = new Map<string, { contactedAt: string; result: string | null; nextDate: string | null; nextType: string | null }>()
  // avg_order_cycle: 최근 90일 주문 날짜 배열
  const orderDatesMap = new Map<string, string[]>()

  for (const o of orders ?? []) {
    const rows = orderRowsMap.get(o.customer_id) ?? []
    rows.push({ order_date: o.order_date, total_amount: o.total_amount ?? 0, point_used: o.point_used ?? 0 })
    orderRowsMap.set(o.customer_id, rows)
    if (!orderMap.has(o.customer_id)) orderMap.set(o.customer_id, { lastDate: o.order_date })
  }

  for (const p of payments ?? []) {
    payMap.set(p.customer_id, (payMap.get(p.customer_id) ?? 0) + (p.amount ?? 0))
  }

  for (const c of contacts ?? []) {
    if (!contactMap.has(c.customer_id)) {
      contactMap.set(c.customer_id, {
        contactedAt: c.contacted_at,
        result:      c.result ?? null,
        nextDate:    c.next_action_date ?? null,
        nextType:    c.next_action_type ?? null,
      })
    }
  }

  for (const o of recent90 ?? []) {
    const dates = orderDatesMap.get(o.customer_id) ?? []
    dates.push(o.order_date)
    orderDatesMap.set(o.customer_id, dates)
  }

  // ── 고객별 avg_order_cycle 계산 ──────────────────────────
  function calcAvgCycle(dates: string[]): number {
    if (dates.length < 3) return 14  // 주문 3건 미만이면 기본 14일
    const gaps: number[] = []
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i] + 'T00:00:00Z').getTime() -
                    new Date(dates[i-1] + 'T00:00:00Z').getTime()) / 86400000
      if (diff > 0) gaps.push(diff)
    }
    if (!gaps.length) return 14
    return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
  }

  // ── overdue_amount 계산 ───────────────────────────────────
  function calcOverdue(customerId: string, terms: number, paid: number): number {
    const rows = orderRowsMap.get(customerId) ?? []
    let overdueOrders = 0
    for (const row of rows) {
      const dueDate = new Date(row.order_date + 'T00:00:00Z')
      dueDate.setUTCDate(dueDate.getUTCDate() + terms)
      if (dueDate <= today) {
        overdueOrders += row.total_amount - (row.point_used ?? 0)
      }
    }
    return Math.max(0, overdueOrders - paid)
  }

  // ── 최종 목표 목록 ─────────────────────────────────────────
  const targets: SalesTarget[] = (customers ?? []).map((c) => {
    const order   = orderMap.get(c.id)
    const paid    = payMap.get(c.id) ?? 0
    const contact = contactMap.get(c.id)
    const terms   = c.payment_terms_days ?? 0

    const overdue_amount        = calcOverdue(c.id, terms, paid)
    const avg_order_cycle       = calcAvgCycle(orderDatesMap.get(c.id) ?? [])
    const days_since_last_order = order?.lastDate
      ? Math.floor((today.getTime() - new Date(order.lastDate + 'T00:00:00Z').getTime()) / 86400000)
      : 999
    const days_since_last_contact = contact?.contactedAt
      ? Math.floor((today.getTime() - new Date(contact.contactedAt).getTime()) / 86400000)
      : null

    const score = calculateScore({ overdue_amount, days_since_last_order, avg_order_cycle, days_since_last_contact })

    return {
      customer_id: c.id, customer_name: c.name, phone: c.phone ?? null,
      score, overdue_amount, days_since_last_order, avg_order_cycle,
      days_since_last_contact,
      next_action_date:    contact?.nextDate  ?? null,
      next_action_type:    contact?.nextType  ?? null,
      last_contact_result: contact?.result    ?? null,
    }
  })

  const sorted = targets
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)

  return { success: true, data: sorted }
}

// ============================================================
// 스크립트 조회
// ============================================================

export async function getSalesScripts(type?: 'call' | 'message' | 'visit'): Promise<ActionResult<SalesScript[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let q = supabase.from('sales_scripts')
    .select('id, type, title, content, is_default, sort_order')
    .or(`tenant_id.eq.${ctx.tenant_id},tenant_id.eq.00000000-0000-0000-0000-000000000000`)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (type) q = q.eq('type', type)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as SalesScript[] }
}

export async function saveSalesScript(input: {
  id?: string; type: 'call' | 'message' | 'visit'; title: string; content: string
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.title.trim() || !input.content.trim())
    return { success: false, error: '제목과 내용을 입력해주세요.' }

  if (input.id) {
    const { error } = await supabase.from('sales_scripts')
      .update({ title: input.title, content: input.content, type: input.type })
      .eq('id', input.id).eq('tenant_id', ctx.tenant_id)
    if (error) return { success: false, error: error.message }
    return { success: true, data: { id: input.id } }
  }

  const { data, error } = await supabase.from('sales_scripts')
    .insert({ tenant_id: ctx.tenant_id, type: input.type, title: input.title, content: input.content, is_default: false, sort_order: 99 })
    .select('id').single()
  if (error || !data) return { success: false, error: error?.message }

  revalidatePath('/sales/scripts')
  return { success: true, data: { id: data.id } }
}

// ============================================================
// 영업이력
// ============================================================

export async function getSalesHistory(customerId?: string): Promise<ActionResult<SalesHistory[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let q = supabase.from('contact_logs')
    .select('id, customer_id, contact_method, result, memo, next_action_date, next_action_type, contacted_at, customers(name)')
    .eq('tenant_id', ctx.tenant_id)
    .order('contacted_at', { ascending: false })
    .limit(200)

  if (customerId) q = q.eq('customer_id', customerId)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id, customer_id: r.customer_id,
      customer_name: r.customers?.name ?? '',
      contact_method: r.contact_method, result: r.result,
      memo: r.memo, next_action_date: r.next_action_date,
      next_action_type: r.next_action_type, contacted_at: r.contacted_at,
    })),
  }
}

// ============================================================
// STEP 4. 메시지 실행 — 변수 치환 + message_logs 기록
// ============================================================

// 변수 치환 (고정 변수 목록)
export function applyTemplateVars(
  content: string,
  vars: {
    customer_name:       string
    last_order_date?:    string
    last_order_amount?:  number
    overdue_amount?:     number
    main_product?:       string
    my_name?:            string
    company_name?:       string
  }
): string {
  return content
    .replace(/\{\{customer_name\}\}/g,      vars.customer_name)
    .replace(/\{\{last_order_date\}\}/g,    vars.last_order_date    ?? '')
    .replace(/\{\{last_order_amount\}\}/g,  vars.last_order_amount != null ? vars.last_order_amount.toLocaleString() + '원' : '')
    .replace(/\{\{overdue_amount\}\}/g,     vars.overdue_amount     != null ? vars.overdue_amount.toLocaleString() + '원' : '')
    .replace(/\{\{main_product\}\}/g,       vars.main_product       ?? '')
    .replace(/\{\{my_name\}\}/g,            vars.my_name            ?? '')
    .replace(/\{\{company_name\}\}/g,       vars.company_name       ?? '')
}

// 메시지 실행 (클립보드 복사 + 기록)
export async function executeMessage(input: {
  customer_id:   string
  script_id?:    string
  content:       string       // 변수 치환 완료된 내용
  channel:       'sms' | 'kakao' | 'clipboard'
  contact_method: 'call' | 'message' | 'visit'
}): Promise<ActionResult<{ message_log_id: string; contact_log_id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 1. message_logs 기록 (simulated — 나중에 API 연결 시 success/failed로 변경)
  const { data: msgLog, error: msgErr } = await supabase
    .from('message_logs')
    .insert({
      tenant_id:   ctx.tenant_id,
      customer_id: input.customer_id,
      script_id:   input.script_id ?? null,
      channel:     input.channel,
      content:     input.content,
      status:      'simulated',
      sent_at:     new Date().toISOString(),
      created_by:  ctx.user_id,
    })
    .select('id').single()

  if (msgErr || !msgLog) return { success: false, error: `로그 저장 실패: ${msgErr?.message}` }

  // 2. contact_logs 기록
  const { data: contactLog, error: contactErr } = await supabase
    .from('contact_logs')
    .insert({
      tenant_id:      ctx.tenant_id,
      customer_id:    input.customer_id,
      contact_method: input.contact_method,
      contacted_by:   ctx.user_id,
      contacted_at:   new Date().toISOString(),
      send_status:    'simulated',
      message_log_id: msgLog.id,
    })
    .select('id').single()

  if (contactErr || !contactLog) return { success: false, error: `이력 저장 실패: ${contactErr?.message}` }

  // message_log에 contact_log_id 역참조
  await supabase.from('message_logs')
    .update({ contact_log_id: contactLog.id })
    .eq('id', msgLog.id)

  revalidatePath('/sales')
  return { success: true, data: { message_log_id: msgLog.id, contact_log_id: contactLog.id } }
}

// ============================================================
// 스케쥴 관리
// ============================================================

export async function getSalesSchedules(dateFrom?: string, dateTo?: string): Promise<ActionResult<SalesSchedule[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

  let q = supabase.from('sales_schedules')
    .select('id, customer_id, scheduled_date, action_type, script_id, status, snooze_count, original_date, memo, customers(name)')
    .eq('tenant_id', ctx.tenant_id)
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: true })

  if (dateFrom) q = q.gte('scheduled_date', dateFrom)
  if (dateTo)   q = q.lte('scheduled_date', dateTo)

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id, customer_id: r.customer_id,
      customer_name: r.customers?.name ?? '',
      scheduled_date: r.scheduled_date, action_type: r.action_type,
      script_id: r.script_id, status: r.status,
      snooze_count: r.snooze_count, original_date: r.original_date ?? null, memo: r.memo,
    })),
  }
}

export async function createSalesSchedule(input: {
  customer_id:    string
  scheduled_date: string
  action_type:    'call' | 'message' | 'visit'
  script_id?:     string
  memo?:          string
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase.from('sales_schedules')
    .insert({
      tenant_id:      ctx.tenant_id,
      customer_id:    input.customer_id,
      scheduled_date: input.scheduled_date,
      action_type:    input.action_type,
      script_id:      input.script_id ?? null,
      memo:           input.memo ?? null,
      created_by:     ctx.user_id,
      original_date:  input.scheduled_date,
    })
    .select('id').single()

  if (error) {
    // 중복 예약 (unique constraint)
    if (error.code === '23505') return { success: false, error: '이미 같은 날짜에 예약이 있습니다.' }
    return { success: false, error: error.message }
  }

  revalidatePath('/sales/schedule')
  return { success: true, data: { id: data.id } }
}

export async function updateScheduleStatus(
  id: string,
  status: 'done' | 'cancelled',
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('sales_schedules')
    .update({ status })
    .eq('id', id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/sales/schedule')
  return { success: true }
}

// ============================================================
// Snooze — 내일로 미루기
// ============================================================

export async function snoozeSchedule(id: string): Promise<ActionResult<{ new_date: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // 현재 스케줄 조회
  const { data: schedule } = await supabase
    .from('sales_schedules')
    .select('id, status, scheduled_date, original_date, snooze_count')
    .eq('id', id).eq('tenant_id', ctx.tenant_id).single()

  if (!schedule) return { success: false, error: '스케줄을 찾을 수 없습니다.' }
  if (schedule.status === 'done') return { success: false, error: '완료된 스케줄은 미룰 수 없습니다.' }
  if (schedule.status === 'cancelled') return { success: false, error: '취소된 스케줄은 미룰 수 없습니다.' }

  // 날짜 +1일
  const current = new Date(schedule.scheduled_date + 'T00:00:00Z')
  current.setUTCDate(current.getUTCDate() + 1)
  const new_date = current.toISOString().slice(0, 10)

  const { error } = await supabase
    .from('sales_schedules')
    .update({
      scheduled_date: new_date,
      snooze_count:   (schedule.snooze_count ?? 0) + 1,
      original_date:  schedule.original_date ?? schedule.scheduled_date,  // 최초만 저장
      status:         'pending',
    })
    .eq('id', id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/sales/schedule')
  return { success: true, data: { new_date } }
}