'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

type TriggerKind =
  | '관리등급:정기관리'
  | '관리등급:방치'
  | '쿠팡+안심번호'

export interface TriggerCreateResult {
  created: number
  skipped_duplicates: number
  rows: Array<{ customer_id: string; scheduled_date: string; trigger: TriggerKind; memo: string }>
}

function kstTodayStr() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function daysSinceIsoDate(todayStr: string, isoOrDateStr: string | null | undefined): number | null {
  if (!isoOrDateStr) return null
  const d = new Date(isoOrDateStr.includes('T') ? isoOrDateStr : isoOrDateStr + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  const today = new Date(todayStr + 'T00:00:00Z')
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

export async function checkAndCreateSalesTriggers(
  tenant_id?: string,
): Promise<ActionResult<TriggerCreateResult>> {
  const supabase = await createSupabaseServer()
  const ctxRaw = await getAuthCtx(supabase)
  if (!ctxRaw) return { success: false, error: '로그인 필요' }
  const ctx = ctxRaw
  if (tenant_id && tenant_id !== ctx.tenant_id) return { success: false, error: 'tenant_id 불일치' }

  const todayStr = kstTodayStr()

  // 1) 대상 거래처 + 분류 태그 + 마지막 연락일 + 오늘 스케줄(중복 방지) 한 번에 준비
  const [
    { data: customers, error: custErr },
    { data: tags, error: tagErr },
    { data: contacts, error: contactErr },
    { data: todaySchedules, error: schErr },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_buyer', true)
      .is('deleted_at', null),

    supabase
      .from('customer_tags')
      .select('customer_id, category, value')
      .eq('tenant_id', ctx.tenant_id)
      .eq('is_active', true)
      .in('category', ['관리등급', '유입경로', '연락상태']),

    supabase
      .from('contact_logs')
      .select('customer_id, contacted_at')
      .eq('tenant_id', ctx.tenant_id)
      .order('contacted_at', { ascending: false }),

    supabase
      .from('sales_schedules')
      .select('customer_id')
      .eq('tenant_id', ctx.tenant_id)
      .eq('scheduled_date', todayStr)
      .neq('status', 'cancelled'),
  ])

  if (custErr) return { success: false, error: custErr.message }
  if (tagErr) return { success: false, error: tagErr.message }
  if (contactErr) return { success: false, error: contactErr.message }
  if (schErr) return { success: false, error: schErr.message }

  const customerIds = new Set((customers ?? []).map((c: any) => c.id))

  // tagMap[customer_id][category] = value
  const tagMap = new Map<string, Map<string, string>>()
  for (const t of tags ?? []) {
    if (!customerIds.has(t.customer_id)) continue
    const m = tagMap.get(t.customer_id) ?? new Map<string, string>()
    m.set(t.category, t.value)
    tagMap.set(t.customer_id, m)
  }

  // lastContactMap[customer_id] = contacted_at (latest)
  const lastContactMap = new Map<string, string>()
  for (const c of contacts ?? []) {
    if (!customerIds.has(c.customer_id)) continue
    if (!lastContactMap.has(c.customer_id)) lastContactMap.set(c.customer_id, c.contacted_at)
  }

  const hasScheduleToday = new Set((todaySchedules ?? []).map((s: any) => s.customer_id))

  // 2) 트리거 조건 평가
  const inserts: Array<any> = []
  const rows: TriggerCreateResult['rows'] = []

  function enqueue(customer_id: string, trigger: TriggerKind, memo: string, action_type: 'call' | 'message' | 'visit') {
    if (hasScheduleToday.has(customer_id)) return
    hasScheduleToday.add(customer_id) // 같은 run 내 중복 방지
    inserts.push({
      tenant_id: ctx.tenant_id,
      customer_id,
      scheduled_date: todayStr,
      action_type,
      status: 'pending',
      snooze_count: 0,
      original_date: todayStr,
      memo,
      created_by: ctx.user_id,
    })
    rows.push({ customer_id, scheduled_date: todayStr, trigger, memo })
  }

  let skipped_duplicates = 0

  for (const id of customerIds) {
    const tm = tagMap.get(id) ?? new Map()

    const mgmt = tm.get('관리등급') ?? null
    const channel = tm.get('유입경로') ?? null
    const contactStatus = tm.get('연락상태') ?? null

    const lastContactAt = lastContactMap.get(id) ?? null
    const since = daysSinceIsoDate(todayStr, lastContactAt) // null = 연락 이력 없음

    // 중복 스케줄 생성 금지(같은 customer_id + 날짜)
    if (hasScheduleToday.has(id)) { skipped_duplicates += 1; continue }

    // 관리등급=정기관리 → 7일마다
    if (mgmt === '정기관리') {
      const days = since ?? 999
      if (days > 7) {
        enqueue(
          id,
          '관리등급:정기관리',
          `트리거: 관리등급=정기관리 — 마지막 연락 ${days}일 경과`,
          'call',
        )
        continue
      }
    }

    // 관리등급=방치 → 30일마다
    if (mgmt === '방치') {
      const days = since ?? 999
      if (days > 30) {
        enqueue(
          id,
          '관리등급:방치',
          `트리거: 관리등급=방치 — 마지막 연락 ${days}일 경과`,
          'call',
        )
        continue
      }
    }

    // 유입경로=쿠팡 + 연락상태=안심번호 → 즉시
    if (channel === '쿠팡' && contactStatus === '안심번호') {
      enqueue(
        id,
        '쿠팡+안심번호',
        `트리거: 쿠팡 유입 + 연락상태=안심번호 — 24시간 내 응답 유도(즉시 연락 필요)`,
        'message',
      )
      continue
    }
  }

  // 3) INSERT (batch)
  if (inserts.length === 0) {
    return { success: true, data: { created: 0, skipped_duplicates, rows: [] } }
  }

  const { error: insErr } = await supabase
    .from('sales_schedules')
    .insert(inserts)

  if (insErr) {
    // unique constraint가 있다면, 일부가 실패할 수 있으나 batch insert는 전체 실패가 일반적.
    return { success: false, error: insErr.message }
  }

  revalidatePath('/sales/schedule')
  return { success: true, data: { created: inserts.length, skipped_duplicates, rows } }
}

