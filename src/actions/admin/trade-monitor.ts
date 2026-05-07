'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export type TradeAnomalyKind =
  | 'rfq_no_bids_24h'
  | 'outbound_due_over_30d'

export interface TradeAnomalyRow {
  kind: TradeAnomalyKind
  title: string
  description: string
  priority: 'high' | 'today'
  category: 'trade' | 'settlement'
  target_tenant_id: string | null
  meta: any
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
  reason?: string | null
  target_table?: string | null
  target_id?: string | null
  old_value?: any
  new_value?: any
}) {
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: input.admin_id,
    tenant_id: null,
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

function kstNowIso() {
  return new Date(Date.now() + 9 * 3600000).toISOString()
}

export async function detectTradeAnomalies(): Promise<ActionResult<{ anomalies: TradeAnomalyRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const now = Date.now()
  const rfqOpenHours = await getAdminSettingNumber('rfq_open_duration_hours', { min: 1, max: 720 })
  const deliveryWindowDays = await getAdminSettingNumber('delivery_signal_window', { min: 1, max: 365 })
  const rfqThresholdIso = new Date(now - rfqOpenHours * 60 * 60 * 1000).toISOString()
  const dueThresholdIso = new Date(now - deliveryWindowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ data: staleRfqs, error: rfqErr }, { data: overdueOutbound, error: payErr }] = await Promise.all([
    supabase
      .from('rfq_requests')
      .select('id, tenant_id, product_name, status, created_at')
      .eq('status', 'open')
      .lt('created_at', rfqThresholdIso)
      .limit(200),
    supabase
      .from('payments')
      .select('id, payer_tenant_id, counterparty_name, amount, due_date, status, direction, created_at')
      .eq('direction', 'outbound')
      .neq('status', 'confirmed')
      .not('due_date', 'is', null)
      .lt('due_date', dueThresholdIso)
      .limit(200),
  ])

  if (rfqErr) return { success: false, error: rfqErr.message }
  if (payErr) return { success: false, error: payErr.message }

  // RFQ 24h 내 입찰 없음: rfq_bids 존재 여부 확인 (IN batch)
  const rfqIds = (staleRfqs ?? []).map((r: any) => r.id).filter(Boolean)
  const { data: bidRows } = rfqIds.length
    ? await supabase
        .from('rfq_bids')
        .select('rfq_id')
        .in('rfq_id', rfqIds)
    : { data: [] as any[] }

  const bidSet = new Set((bidRows ?? []).map((b: any) => b.rfq_id))

  const anomalies: TradeAnomalyRow[] = []

  for (const r of staleRfqs ?? []) {
    if (bidSet.has((r as any).id)) continue
    anomalies.push({
      kind: 'rfq_no_bids_24h',
      title: `RFQ ${rfqOpenHours}시간 무입찰`,
      description: `RFQ 「${(r as any).product_name ?? '품목'}」 — ${rfqOpenHours}시간 내 입찰 없음`,
      priority: 'today',
      category: 'trade',
      target_tenant_id: (r as any).tenant_id ?? null,
      meta: { rfq_id: (r as any).id, created_at: (r as any).created_at },
    })
  }

  for (const p of overdueOutbound ?? []) {
    anomalies.push({
      kind: 'outbound_due_over_30d',
      title: `${deliveryWindowDays}일 초과 미정산(지급)`,
      description: `지급 due_date ${(p as any).due_date} — ${(p as any).counterparty_name ?? '매입처'} ${(p as any).amount?.toLocaleString?.() ?? (p as any).amount}원`,
      priority: 'high',
      category: 'settlement',
      target_tenant_id: (p as any).payer_tenant_id ?? null,
      meta: { payment_id: (p as any).id, due_date: (p as any).due_date, status: (p as any).status },
    })
  }

  // 조회 로그 best-effort
  await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trade_monitor_detect',
    reason: 'detect trade anomalies',
    target_table: 'rfq_requests/payments',
    new_value: { anomalies_count: anomalies.length },
  }).catch(() => {})

  return { success: true, data: { anomalies } }
}

export async function upsertActionQueueForTradeAnomalies(): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const det = await detectTradeAnomalies()
  if (!det.success || !det.data) return { success: false, error: det.error ?? '이상 감지 실패' }

  const anomalies = det.data.anomalies
  if (!anomalies.length) return { success: true, data: { created: 0 } }

  // 중복 방지: 같은 kind + meta key로 title을 구성 (하드 유니크 인덱스는 없음 → best-effort)
  const nowIso = kstNowIso()
  const rows = anomalies.map((a) => ({
    priority: a.priority,
    category: a.category,
    title: a.title,
    description: a.description,
    status: 'pending',
    action_options: a.meta,
    target_tenant_id: a.target_tenant_id,
    expires_at: null,
    escalated_at: null,
    resolved_by: null,
    resolved_at: null,
    created_at: nowIso,
  }))

  // 이미 동일 meta가 pending/in_progress로 존재하면 skip (title+action_options.rfq_id/payment_id)
  const rfqIds = anomalies.filter((a) => a.kind === 'rfq_no_bids_24h').map((a) => a.meta?.rfq_id).filter(Boolean)
  const payIds = anomalies.filter((a) => a.kind === 'outbound_due_over_30d').map((a) => a.meta?.payment_id).filter(Boolean)

  const existingIds = new Set<string>()
  if (rfqIds.length || payIds.length) {
    const { data: existing } = await supabase
      .from('action_queue')
      .select('id, action_options')
      .in('status', ['pending', 'in_progress'])
      .limit(500)

    for (const e of (existing ?? []) as any[]) {
      const meta = e.action_options ?? {}
      if (meta.rfq_id && rfqIds.includes(meta.rfq_id)) existingIds.add(`rfq:${meta.rfq_id}`)
      if (meta.payment_id && payIds.includes(meta.payment_id)) existingIds.add(`pay:${meta.payment_id}`)
    }
  }

  const toInsert = rows.filter((r: any) => {
    const meta = r.action_options ?? {}
    if (meta.rfq_id) return !existingIds.has(`rfq:${meta.rfq_id}`)
    if (meta.payment_id) return !existingIds.has(`pay:${meta.payment_id}`)
    return true
  })

  if (toInsert.length === 0) return { success: true, data: { created: 0 } }

  const { error } = await supabase.from('action_queue').insert(toInsert)
  if (error) return { success: false, error: error.message }

  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'trade_monitor_enqueue',
    target_table: 'action_queue',
    reason: 'enqueue trade anomalies',
    new_value: { created: toInsert.length },
  })
  if (!logRes.ok) return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }

  return { success: true, data: { created: toInsert.length } }
}

