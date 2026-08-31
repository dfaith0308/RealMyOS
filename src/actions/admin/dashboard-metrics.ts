'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getAccountsReceivable, classifyAccountsReceivable, saleAmount } from '@/lib/ledger-calc'
import {
  CHURN_PARAMS,
  classifyChurnSignal,
  daysSince,
  todayKST,
} from '@/lib/churn-signal'
import { fetchInboundSupersededSubset } from '@/lib/inbound-payment-superseded'
import { getAdminSettingNumber } from '@/actions/admin/policy-console'

/**
 * 관리자 대시보드 지표.
 *
 * 원칙
 * - 계산값은 저장하지 않는다. 매 요청마다 실시간 계산한다.
 * - 미수금/초과입금은 getAccountsReceivable + classifyAccountsReceivable,
 *   이탈/재구매 판정은 @/lib/churn-signal 을 그대로 재사용한다. 다르게 계산하면
 *   공급자 원장·거래처 화면과 숫자가 어긋난다.
 * - 쿼리 수는 데이터 건수와 무관하게 고정이다 (행당 조회 없음).
 * - Supabase 기본 1000행 제한 때문에 집계용 조회는 반드시 fetchAll 로 전량을 받는다.
 *   limit 로 잘리면 숫자가 조용히 틀린다.
 */

/** 카드 클릭 시 보여줄 상세 목록의 공통 행 */
export type MetricRow = {
  id: string
  name: string
  meta: string
  value: string
  alert: boolean
  /** 목록 정렬용 (표시하지 않음). 큰 값이 위로 — 심한 것부터 */
  sortKey: number
}

export type MetricBlock = {
  count: number
  rows: MetricRow[]
}

const PAGE = 1000

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

/** 1000행 제한을 넘겨 전량을 받는다 — 집계가 조용히 잘리는 것을 막는다 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < 200; page++) {
    const from = page * PAGE
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

// ============================================================
// 식당 현황
// ============================================================

export type RestaurantMetrics = {
  cycleRisk: MetricBlock
  repurchaseWait: MetricBlock
  receivable: MetricBlock
  prepayment: MetricBlock
  newSignupNoOrder: MetricBlock
  params: { cycleMultiplier: number; waitDays: number; waitMaxDays: number; noOrderDays: number }
}

type CustomerRow = {
  id: string
  tenant_id: string
  name: string | null
  opening_balance: number | null
}
type OrderRow = {
  customer_id: string
  total_amount: number
  discount_amount: number | null
  point_used: number | null
  order_date: string
}
type PaymentRow = { id: string; customer_id: string; amount: number }

const NEW_SIGNUP_NO_ORDER_DAYS = 14

export async function getRestaurantMetrics(): Promise<
  { success: true; data: RestaurantMetrics } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createSupabaseAdmin()
    const orderCycleCount = await getAdminSettingNumber('order_cycle_calculation_count', {
      min: 2,
      max: 90,
    })
    const today = todayKST()

    // ── 조회 (건수와 무관하게 고정 횟수) ─────────────────────
    const [customers, orders, payments, tenants] = await Promise.all([
      fetchAll<CustomerRow>((from, to) =>
        supabase
          .from('customers')
          .select('id, tenant_id, name, opening_balance')
          .eq('is_buyer', true)
          .is('deleted_at', null)
          .range(from, to),
      ),
      fetchAll<OrderRow>((from, to) =>
        supabase
          .from('orders')
          .select('customer_id, total_amount, discount_amount, point_used, order_date')
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .not('customer_id', 'is', null)
          .range(from, to),
      ),
      fetchAll<PaymentRow>((from, to) =>
        supabase
          .from('payments')
          .select('id, customer_id, amount')
          .eq('direction', 'inbound')
          .eq('status', 'confirmed')
          .is('reversal_of_id', null)
          .not('customer_id', 'is', null)
          .range(from, to),
      ),
      fetchAll<{ id: string; name: string | null }>((from, to) =>
        supabase.from('tenants').select('id, name').is('deleted_at', null).range(from, to),
      ),
    ])

    // append-only 상쇄로 무효화된 원본 입금은 제외 (원장과 동일 규칙)
    const superseded = new Set(
      await fetchInboundSupersededSubset(
        supabase as SupabaseClient,
        payments.map((p) => p.id),
      ),
    )

    const tenantName = new Map(tenants.map((t) => [t.id, t.name ?? '(이름없음)']))

    // ── 집계 ────────────────────────────────────────────────
    const ordersByCustomer = new Map<string, OrderRow[]>()
    for (const o of orders) {
      const list = ordersByCustomer.get(o.customer_id)
      if (list) list.push(o)
      else ordersByCustomer.set(o.customer_id, [o])
    }
    for (const list of ordersByCustomer.values()) {
      list.sort((a, b) => (a.order_date < b.order_date ? 1 : -1)) // 최신순 — ledger.ts 와 동일
    }

    const paidByCustomer = new Map<string, number>()
    for (const p of payments) {
      if (superseded.has(p.id)) continue
      paidByCustomer.set(p.customer_id, (paidByCustomer.get(p.customer_id) ?? 0) + (p.amount ?? 0))
    }

    const cycleRisk: MetricRow[] = []
    const repurchaseWait: MetricRow[] = []
    const receivable: MetricRow[] = []
    const prepayment: MetricRow[] = []

    for (const c of customers) {
      const list = ordersByCustomer.get(c.id) ?? []
      const label = c.name?.trim() || '(이름없음)'
      const owner = tenantName.get(c.tenant_id) ?? '알 수 없는 공급자'

      // ① 미수금 / 초과입금 — 기존 원장과 동일한 계산식
      const totalSales = list.reduce((sum, o) => sum + saleAmount(o), 0)
      const ar = getAccountsReceivable(c.opening_balance ?? 0, totalSales, paidByCustomer.get(c.id) ?? 0, 0)
      const arView = classifyAccountsReceivable(ar)
      if (arView.kind === 'receivable') {
        receivable.push({
          id: c.id,
          name: label,
          meta: `${owner} · 거래처`,
          value: won(arView.absolute),
          alert: true,
          sortKey: arView.absolute,
        })
      } else if (arView.kind === 'prepayment') {
        prepayment.push({
          id: c.id,
          name: label,
          meta: `${owner} · ${arView.hint ?? ''}`.trim(),
          value: won(arView.absolute),
          alert: false,
          sortKey: arView.absolute,
        })
      }

      // ②③ 이탈/재구매 판정 — 성장 지표와 같은 함수를 쓴다 (@/lib/churn-signal)
      const signal = classifyChurnSignal(
        list.map((o) => o.order_date),
        today,
        orderCycleCount,
      )

      if (signal.kind === 'cycle_risk') {
        cycleRisk.push({
          id: c.id,
          name: label,
          meta: `${owner} · 평균 ${signal.cycleDays}일 주기 · 총 ${signal.orderCount}회 구매`,
          value: `${signal.daysSinceLast}일째 무주문`,
          alert: true,
          sortKey: signal.daysSinceLast,
        })
      } else if (signal.kind === 'repurchase_wait') {
        repurchaseWait.push({
          id: c.id,
          name: label,
          meta: `${owner} · 총 ${signal.orderCount}회 구매 · 최종 ${signal.lastOrderDate}`,
          value: `${signal.daysSinceLast}일 경과`,
          alert: false,
          sortKey: signal.daysSinceLast,
        })
      }
    }

    // ④ 신규가입 후 미주문 — 식당 테넌트 기준
    const cutoff = new Date(today.getTime() - NEW_SIGNUP_NO_ORDER_DAYS * 86400000).toISOString()
    const restaurantTenants = await fetchAll<{ id: string; name: string | null; created_at: string }>(
      (from, to) =>
        supabase
          .from('tenants')
          .select('id, name, created_at')
          .eq('role', 'restaurant')
          .is('deleted_at', null)
          .lte('created_at', cutoff)
          .range(from, to),
    )

    // 주문 이력 조회는 대상 식당 테넌트로만 좁힌다 — commerce_orders 전체를 훑지 않는다
    const restaurantIds = restaurantTenants.map((t) => t.id)
    const orderedTenantIds = new Set(
      restaurantIds.length === 0
        ? []
        : (
            await fetchAll<{ tenant_id: string }>((from, to) =>
              supabase
                .from('commerce_orders')
                .select('tenant_id')
                .in('tenant_id', restaurantIds)
                .range(from, to),
            )
          ).map((r) => r.tenant_id),
    )

    const newSignupNoOrder: MetricRow[] = restaurantTenants
      .filter((t) => !orderedTenantIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name ?? '(이름없음)',
        meta: `가입 ${t.created_at.slice(0, 10)}`,
        value: `${daysSince(t.created_at.slice(0, 10), today)}일째 미주문`,
        alert: true,
        sortKey: daysSince(t.created_at.slice(0, 10), today),
      }))

    const block = (rows: MetricRow[]): MetricBlock => ({
      count: rows.length,
      rows: [...rows].sort((a, b) => b.sortKey - a.sortKey),
    })

    return {
      success: true,
      data: {
        cycleRisk: block(cycleRisk),
        repurchaseWait: block(repurchaseWait),
        receivable: block(receivable),
        prepayment: block(prepayment),
        newSignupNoOrder: block(newSignupNoOrder),
        params: { ...CHURN_PARAMS, noOrderDays: NEW_SIGNUP_NO_ORDER_DAYS },
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '식당 지표 계산 실패' }
  }
}

// ============================================================
// 공급자 현황
// ============================================================

export type SupplierMetrics = {
  paidUnprocessed: MetricBlock
  trialEnding: MetricBlock
  noLogin: MetricBlock
  params: { unprocessedHours: number; trialDays: number; noLoginDays: number }
}

const UNPROCESSED_HOURS = 24
const TRIAL_ENDING_DAYS = 7
const NO_LOGIN_DAYS = 7

/**
 * 마지막 로그인은 public 스키마에 기록이 없어 Supabase 인증(auth.users)의
 * last_sign_in_at 을 service role 로 읽는다. 테넌트에 사용자가 여러 명이면
 * 그중 가장 최근 로그인을 그 테넌트의 마지막 로그인으로 본다.
 */
async function fetchLastSignInByUserId(
  supabase: SupabaseClient,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const users = data?.users ?? []
    for (const u of users) out.set(u.id, (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null)
    if (users.length < 1000) break
  }
  return out
}

export async function getSupplierMetrics(): Promise<
  { success: true; data: SupplierMetrics } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  try {
    const supabase = await createSupabaseAdmin()
    const today = todayKST()
    const now = Date.now()

    const unprocessedCutoff = new Date(now - UNPROCESSED_HOURS * 3600000).toISOString()
    const trialCutoff = new Date(now + TRIAL_ENDING_DAYS * 86400000).toISOString()
    const nowIso = new Date(now).toISOString()

    const [paidOrders, tenants, supplierTenants, users] = await Promise.all([
      // ① 결제완료 후 미처리 — paid 상태로 24시간 이상 머문 주문
      fetchAll<{
        id: string
        order_number: string | null
        tenant_id: string
        total_amount: number
        updated_at: string
      }>((from, to) =>
        supabase
          .from('commerce_orders')
          .select('id, order_number, tenant_id, total_amount, updated_at')
          .eq('status', 'paid')
          .lt('updated_at', unprocessedCutoff)
          .range(from, to),
      ),
      fetchAll<{ id: string; name: string | null }>((from, to) =>
        supabase.from('tenants').select('id, name').is('deleted_at', null).range(from, to),
      ),
      // ② 구독/무료기간 종료 임박 + ③ 로그인 없음 대상 — 공급자 테넌트
      fetchAll<{ id: string; name: string | null; plan_expires_at: string | null }>((from, to) =>
        supabase
          .from('tenants')
          .select('id, name, plan_expires_at')
          .eq('role', 'supplier')
          .is('deleted_at', null)
          .range(from, to),
      ),
      fetchAll<{ id: string; tenant_id: string | null }>((from, to) =>
        supabase.from('users').select('id, tenant_id').not('tenant_id', 'is', null).range(from, to),
      ),
    ])

    const tenantName = new Map(tenants.map((t) => [t.id, t.name ?? '(이름없음)']))

    const paidUnprocessed: MetricRow[] = paidOrders.map((o) => {
      const hours = Math.floor((now - new Date(o.updated_at).getTime()) / 3600000)
      return {
        id: o.id,
        name: o.order_number ?? o.id.slice(0, 8),
        meta: `${tenantName.get(o.tenant_id) ?? '알 수 없음'} · ${won(o.total_amount ?? 0)}`,
        value: `${hours}시간 대기`,
        alert: true,
        sortKey: hours,
      }
    })

    const trialEnding: MetricRow[] = supplierTenants
      .filter((t) => t.plan_expires_at && t.plan_expires_at > nowIso && t.plan_expires_at <= trialCutoff)
      .map((t) => {
        const left = Math.max(
          0,
          Math.ceil((new Date(t.plan_expires_at as string).getTime() - now) / 86400000),
        )
        return {
          id: t.id,
          name: t.name ?? '(이름없음)',
          meta: `만료 ${(t.plan_expires_at as string).slice(0, 10)}`,
          value: `${left}일 남음`,
          alert: true,
          // 남은 일수가 적을수록 위로
          sortKey: -left,
        }
      })

    // ③ 로그인 없음 — auth.users.last_sign_in_at 기준
    const lastSignIn = await fetchLastSignInByUserId(supabase as SupabaseClient)
    const lastSignInByTenant = new Map<string, string | null>()
    for (const u of users) {
      if (!u.tenant_id) continue
      const at = lastSignIn.get(u.id) ?? null
      const prev = lastSignInByTenant.get(u.tenant_id)
      if (prev === undefined || (at !== null && (prev === null || at > prev))) {
        lastSignInByTenant.set(u.tenant_id, at)
      }
    }

    const noLoginCutoff = new Date(now - NO_LOGIN_DAYS * 86400000).toISOString()
    const noLogin: MetricRow[] = supplierTenants
      .filter((t) => {
        if (!lastSignInByTenant.has(t.id)) return false // 계정이 아직 없는 테넌트는 제외
        const at = lastSignInByTenant.get(t.id) ?? null
        return at === null || at < noLoginCutoff
      })
      .map((t) => {
        const at = lastSignInByTenant.get(t.id) ?? null
        return {
          id: t.id,
          name: t.name ?? '(이름없음)',
          meta: at ? `최종 로그인 ${at.slice(0, 10)}` : '로그인 기록 없음',
          value: at ? `${daysSince(at.slice(0, 10), today)}일째` : '기록 없음',
          alert: true,
          sortKey: at ? daysSince(at.slice(0, 10), today) : 9999,
        }
      })

    const block = (rows: MetricRow[]): MetricBlock => ({
      count: rows.length,
      rows: [...rows].sort((a, b) => b.sortKey - a.sortKey),
    })

    return {
      success: true,
      data: {
        paidUnprocessed: block(paidUnprocessed),
        trialEnding: block(trialEnding),
        noLogin: block(noLogin),
        params: {
          unprocessedHours: UNPROCESSED_HOURS,
          trialDays: TRIAL_ENDING_DAYS,
          noLoginDays: NO_LOGIN_DAYS,
        },
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '공급자 지표 계산 실패' }
  }
}

// ============================================================
// 오늘의 영업
// ============================================================

export type SalesMetrics = {
  newLeadsThisWeek: MetricBlock
  meetingScheduled: MetricBlock
  leadTrialEnding: MetricBlock
  /** sales_leads 마이그레이션이 아직 적용되지 않은 상태 */
  notReady: boolean
  params: { trialDays: number }
}

/** 테이블/컬럼이 아직 없는 경우 (마이그레이션 미적용) */
function isMissingRelation(message: string): boolean {
  return /does not exist|could not find the table|schema cache|relation .* does not exist/i.test(message)
}

/** KST 기준 이번 주 월요일 00:00 */
function weekStartKST(today: Date): string {
  const dow = today.getUTCDay() // 0=일
  const backToMonday = dow === 0 ? 6 : dow - 1
  return new Date(today.getTime() - backToMonday * 86400000).toISOString()
}

export async function getSalesMetrics(): Promise<
  { success: true; data: SalesMetrics } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const empty: MetricBlock = { count: 0, rows: [] }

  try {
    const supabase = await createSupabaseAdmin()
    const today = todayKST()
    const now = Date.now()
    const weekStart = weekStartKST(today)
    const trialCutoff = new Date(now + TRIAL_ENDING_DAYS * 86400000).toISOString()
    const nowIso = new Date(now).toISOString()

    const leads = await fetchAll<{
      id: string
      company_name: string
      lead_type: string
      status: string
      created_at: string
    }>((from, to) =>
      supabase
        .from('sales_leads')
        .select('id, company_name, lead_type, status, created_at')
        .range(from, to),
    )

    const typeLabel = (t: string) => (t === 'supplier' ? '공급자' : '식당')

    const newLeadsThisWeek: MetricRow[] = leads
      .filter((l) => l.created_at >= weekStart)
      .map((l) => ({
        id: l.id,
        name: l.company_name,
        meta: `${typeLabel(l.lead_type)} · 등록 ${l.created_at.slice(0, 10)}`,
        value: `${daysSince(l.created_at.slice(0, 10), today)}일 전`,
        alert: false,
        sortKey: -daysSince(l.created_at.slice(0, 10), today),
      }))

    const meetingScheduled: MetricRow[] = leads
      .filter((l) => l.status === 'meeting')
      .map((l) => ({
        id: l.id,
        name: l.company_name,
        meta: `${typeLabel(l.lead_type)} · 미팅예정`,
        value: `등록 ${l.created_at.slice(0, 10)}`,
        alert: false,
        sortKey: -daysSince(l.created_at.slice(0, 10), today),
      }))

    // 리드에 발급한 프로모션 코드를 실제로 쓴 테넌트 중 만료 임박
    const leadName = new Map(leads.map((l) => [l.id, l.company_name]))
    const coupons = await fetchAll<{ id: string; lead_id: string | null }>((from, to) =>
      supabase.from('coupons').select('id, lead_id').not('lead_id', 'is', null).range(from, to),
    )

    let leadTrialEnding: MetricRow[] = []
    if (coupons.length > 0) {
      const leadByCoupon = new Map(coupons.map((c) => [c.id, c.lead_id as string]))
      const uses = await fetchAll<{ coupon_id: string; tenant_id: string }>((from, to) =>
        supabase
          .from('coupon_uses')
          .select('coupon_id, tenant_id')
          .in(
            'coupon_id',
            coupons.map((c) => c.id),
          )
          .range(from, to),
      )

      const tenantIds = Array.from(new Set(uses.map((u) => u.tenant_id)))
      const expiring = new Map<string, { name: string | null; plan_expires_at: string }>()
      if (tenantIds.length > 0) {
        const rows = await fetchAll<{ id: string; name: string | null; plan_expires_at: string | null }>(
          (from, to) =>
            supabase
              .from('tenants')
              .select('id, name, plan_expires_at')
              .in('id', tenantIds)
              .not('plan_expires_at', 'is', null)
              .gt('plan_expires_at', nowIso)
              .lte('plan_expires_at', trialCutoff)
              .range(from, to),
        )
        for (const r of rows) {
          if (r.plan_expires_at) expiring.set(r.id, { name: r.name, plan_expires_at: r.plan_expires_at })
        }
      }

      // 리드 단위로 중복 제거
      const seen = new Set<string>()
      for (const u of uses) {
        const exp = expiring.get(u.tenant_id)
        if (!exp) continue
        const leadId = leadByCoupon.get(u.coupon_id)
        if (!leadId || seen.has(leadId)) continue
        seen.add(leadId)
        const left = Math.max(0, Math.ceil((new Date(exp.plan_expires_at).getTime() - now) / 86400000))
        leadTrialEnding.push({
          id: leadId,
          name: leadName.get(leadId) ?? '(리드 없음)',
          meta: `가입 테넌트 ${exp.name ?? '(이름없음)'} · 만료 ${exp.plan_expires_at.slice(0, 10)}`,
          value: `${left}일 남음`,
          alert: true,
          sortKey: -left,
        })
      }
    }

    const block = (rows: MetricRow[]): MetricBlock => ({
      count: rows.length,
      rows: [...rows].sort((a, b) => b.sortKey - a.sortKey),
    })

    return {
      success: true,
      data: {
        newLeadsThisWeek: block(newLeadsThisWeek),
        meetingScheduled: block(meetingScheduled),
        leadTrialEnding: block(leadTrialEnding),
        notReady: false,
        params: { trialDays: TRIAL_ENDING_DAYS },
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '영업 지표 계산 실패'
    // 영업 리드 마이그레이션 미적용 — 대시보드 전체를 깨뜨리지 않고 안내만 한다
    if (isMissingRelation(message)) {
      return {
        success: true,
        data: {
          newLeadsThisWeek: empty,
          meetingScheduled: empty,
          leadTrialEnding: empty,
          notReady: true,
          params: { trialDays: TRIAL_ENDING_DAYS },
        },
      }
    }
    return { success: false, error: message }
  }
}
