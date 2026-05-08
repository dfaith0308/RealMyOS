'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

export type TradeAnomalyKind =
  | 'rfq_no_bids_24h'
  | 'outbound_due_over_30d'

export type TradeTimelineStep =
  | 'rfq_created'
  | 'bid_received'
  | 'bid_selected'
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'settlement_paid'

export interface TradeTimelineItem {
  step: TradeTimelineStep
  label: string
  completed_at: string | null
  duration_hours: number | null
  is_anomaly: boolean
  note?: string | null
  meta?: any
}

export interface TradeTimelineResult {
  input_id: string
  resolved: { kind: 'order' | 'rfq' | 'payment' | 'unknown'; order_id: string | null; rfq_id: string | null; payment_id: string | null }
  thresholds: { rfq_open_duration_hours: number; delivery_signal_window: number }
  timeline: TradeTimelineItem[]
  hints: string[]
}

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

function hoursBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.floor((b - a) / 3600000))
}

function daysSinceIsoDay(day: string): number {
  const t = new Date(`${day}T00:00:00Z`).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / 86400000)
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

async function loadOrderStatusTimestamps(
  supabase: any,
  order_id: string,
): Promise<{ shipped_at: string | null; delivered_at: string | null }> {
  // order_status의 단계별 완료 시각은 order_logs의 update 기록(created_at)을 기준으로 잡는다.
  const { data: logs, error } = await supabase
    .from('order_logs')
    .select('after_data, created_at, action')
    .eq('order_id', order_id)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)

  let shipped_at: string | null = null
  let delivered_at: string | null = null

  for (const lg of (logs ?? []) as any[]) {
    const os = lg.after_data?.order_status
    if (!os) continue
    if (!shipped_at && os === '출고완료') shipped_at = lg.created_at ?? null
    if (!delivered_at && os === '납품완료') delivered_at = lg.created_at ?? null
  }

  return { shipped_at, delivered_at }
}

export async function getTradeTimeline(id: string): Promise<ActionResult<TradeTimelineResult>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const rfqOpenHours = await getAdminSettingNumber('rfq_open_duration_hours', { min: 1, max: 720 })
  const deliveryWindowDays = await getAdminSettingNumber('delivery_signal_window', { min: 1, max: 365 })

  const hints: string[] = []
  let resolved: TradeTimelineResult['resolved'] = {
    kind: 'unknown',
    order_id: null,
    rfq_id: null,
    payment_id: null,
  }

  // 1) orders.id 우선
  const { data: orderRow } = await supabase
    .from('orders')
    .select('id, status, order_status, created_at, order_date')
    .eq('id', id)
    .maybeSingle()

  if (orderRow?.id) {
    resolved = { kind: 'order', order_id: orderRow.id, rfq_id: null, payment_id: null }
  } else {
    // 2) rfq_requests.id
    const { data: rfqRow } = await supabase
      .from('rfq_requests')
      .select('id, created_at, status, product_name, tenant_id')
      .eq('id', id)
      .maybeSingle()

    if (rfqRow?.id) {
      resolved = { kind: 'rfq', order_id: null, rfq_id: rfqRow.id, payment_id: null }
    } else {
      // 3) payments.id → order_id로 승격 가능
      const { data: payRow } = await supabase
        .from('payments')
        .select('id, type, status, created_at, order_id')
        .eq('id', id)
        .maybeSingle()

      if (payRow?.id) {
        resolved = {
          kind: 'payment',
          order_id: payRow.order_id ?? null,
          rfq_id: null,
          payment_id: payRow.id,
        }
        if (!resolved.order_id) hints.push('payment에 order_id 연결이 없어 주문 단계를 추적할 수 없습니다.')
      }
    }
  }

  // 데이터 로드
  const rfq = resolved.rfq_id
    ? (
        await supabase
          .from('rfq_requests')
          .select('id, created_at, status, product_name, tenant_id')
          .eq('id', resolved.rfq_id)
          .maybeSingle()
      ).data
    : null

  const order = resolved.order_id
    ? (
        await supabase
          .from('orders')
          .select('id, status, order_status, created_at, order_date')
          .eq('id', resolved.order_id)
          .maybeSingle()
      ).data
    : null

  const bids = resolved.rfq_id
    ? (
        await supabase
          .from('rfq_bids')
          .select('id, rfq_id, status, created_at')
          .eq('rfq_id', resolved.rfq_id)
          .order('created_at', { ascending: true })
          .limit(2000)
      ).data ?? []
    : []

  const selectedBid = bids.find((b: any) => b.status === 'selected') ?? null
  const firstBid = bids.length ? bids[0] : null

  // settlement: order_id 기반으로 조회
  const settlement = resolved.order_id
    ? (
        await supabase
          .from('payments')
          .select('id, type, status, created_at, order_id')
          .eq('type', 'settlement')
          .eq('status', 'confirmed')
          .eq('order_id', resolved.order_id)
          .order('created_at', { ascending: true })
          .limit(1)
      ).data?.[0] ?? null
    : null

  let shippedAt: string | null = null
  let deliveredAt: string | null = null
  if (resolved.order_id) {
    const ts = await loadOrderStatusTimestamps(supabase, resolved.order_id).catch(() => ({
      shipped_at: null,
      delivered_at: null,
    }))
    shippedAt = ts.shipped_at
    deliveredAt = ts.delivered_at
  }

  // completed_at 계산
  const rfqCreatedAt = rfq?.created_at ?? null
  const bidReceivedAt = firstBid?.created_at ?? null
  const bidSelectedAt = selectedBid?.created_at ?? null
  const orderConfirmedAt = order?.status === 'confirmed' ? (order.created_at ?? null) : null
  const orderShippedAt = shippedAt
  const orderDeliveredAt = deliveredAt
  const settlementPaidAt = settlement?.created_at ?? null

  // duration + anomaly
  const steps: Array<{ step: TradeTimelineStep; label: string; completed_at: string | null; anomaly: (cur: string | null, prev: string | null) => boolean; note?: string | null }> =
    [
      {
        step: 'rfq_created',
        label: 'RFQ 생성',
        completed_at: rfqCreatedAt,
        anomaly: () => false,
        note: rfq ? `품목: ${rfq.product_name ?? '—'}` : 'RFQ 데이터 없음',
      },
      {
        step: 'bid_received',
        label: '입찰 접수',
        completed_at: bidReceivedAt,
        anomaly: (cur, prev) => {
          if (!prev) return false
          if (cur) return false
          // 무입찰 기준: RFQ 생성 후 rfq_open_duration_hours 초과
          const hours = hoursBetween(prev, kstNowIso())
          return hours > rfqOpenHours
        },
        note: bids.length ? `입찰 ${bids.length}건` : '입찰 없음',
      },
      {
        step: 'bid_selected',
        label: '낙찰',
        completed_at: bidSelectedAt,
        anomaly: () => false,
        note: selectedBid ? `selected bid: ${String(selectedBid.id).slice(0, 8)}…` : '선택된 입찰 없음',
      },
      {
        step: 'order_confirmed',
        label: '주문 확정',
        completed_at: orderConfirmedAt,
        anomaly: () => false,
        note: order ? `status: ${order.status ?? '—'}` : '주문 데이터 없음',
      },
      {
        step: 'order_shipped',
        label: '출고',
        completed_at: orderShippedAt,
        anomaly: () => false,
        note: order ? `order_status: ${order.order_status ?? '—'}` : null,
      },
      {
        step: 'order_delivered',
        label: '납품 완료',
        completed_at: orderDeliveredAt,
        anomaly: (cur, prev) => {
          if (!prev) return false
          if (cur) return false
          // 주문 미납품: 주문 확정 이후 delivery_signal_window 초과
          const prevDay = String(prev).slice(0, 10)
          const days = daysSinceIsoDay(prevDay)
          return days > deliveryWindowDays
        },
        note: orderDeliveredAt ? '납품완료 기록(order_logs 기준)' : '미완료',
      },
      {
        step: 'settlement_paid',
        label: '정산',
        completed_at: settlementPaidAt,
        anomaly: () => false,
        note: settlementPaidAt ? 'settlement payment confirmed' : '정산 없음',
      },
    ]

  const timeline: TradeTimelineItem[] = []
  let prevCompleted: string | null = null

  for (const st of steps) {
    const duration_hours =
      st.completed_at && prevCompleted ? hoursBetween(prevCompleted, st.completed_at) : null
    const is_anomaly = st.anomaly(st.completed_at, prevCompleted)
    timeline.push({
      step: st.step,
      label: st.label,
      completed_at: st.completed_at,
      duration_hours,
      is_anomaly,
      note: st.note ?? null,
    })
    if (st.completed_at) prevCompleted = st.completed_at
  }

  if (resolved.kind === 'unknown') {
    hints.push('id가 orders/rfq_requests/payments 어디에도 매칭되지 않았습니다.')
  }
  if (resolved.kind === 'order' && !rfq) {
    hints.push('주문과 RFQ 연결 키가 코드/스키마에 명시되어 있지 않아 RFQ 단계는 표시되지 않을 수 있습니다.')
  }

  return {
    success: true,
    data: {
      input_id: id,
      resolved,
      thresholds: { rfq_open_duration_hours: rfqOpenHours, delivery_signal_window: deliveryWindowDays },
      timeline,
      hints,
    },
  }
}

