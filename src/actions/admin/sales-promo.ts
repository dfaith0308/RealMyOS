'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

/**
 * 구독료 프로모션 코드.
 *
 * 신규 promo_codes 테이블을 만들지 않고 기존 `coupons` 를 확장해서 쓴다
 * (code UNIQUE / free_months / max_uses / used_count / expires_at / created_by 가
 * 이미 동일한 스펙이고, 결제 화면에서 코드 입력창이 둘로 갈리는 것을 피하기 위함).
 * 영업 리드 연결은 확장 컬럼 coupons.lead_id 로 한다.
 */

/** 'any' = 모든 플랜. monthly/annual = 해당 플랜 전용 */
export type PromoPlan = 'any' | 'monthly' | 'annual'

export type PromoCodeRow = {
  id: string
  code: string
  plan: string
  free_months: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  created_at: string
  lead_id: string | null
  lead_name: string | null
  memo: string | null
  is_expired: boolean
  is_exhausted: boolean
}

export type PromoUsageRow = {
  coupon_id: string
  tenant_id: string
  tenant_name: string | null
  used_at: string
  plan_expires_at: string
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{4,32}$/

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export async function createPromoCode(input: {
  code: string
  free_months: number
  max_uses: number | null
  expires_at?: string | null
  plan?: PromoPlan
  lead_id?: string | null
  memo?: string | null
}): Promise<ActionResult<{ id: string; code: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const code = (input.code ?? '').trim().toUpperCase()
  if (!CODE_PATTERN.test(code)) {
    return {
      success: false,
      error: '코드는 영문/숫자/.-_ 조합 4~32자여야 합니다',
    }
  }

  const free_months = Math.floor(Number(input.free_months))
  if (!Number.isFinite(free_months) || free_months < 1 || free_months > 24) {
    return { success: false, error: '무료 개월수는 1~24 사이여야 합니다' }
  }

  // null = 무제한
  let max_uses: number | null = null
  if (input.max_uses !== null && input.max_uses !== undefined) {
    const n = Math.floor(Number(input.max_uses))
    if (!Number.isFinite(n) || n < 1) return { success: false, error: '사용 가능 횟수는 1 이상이어야 합니다' }
    max_uses = n
  }

  const plan: PromoPlan =
    input.plan === 'monthly' || input.plan === 'annual' ? input.plan : 'any'

  let expires_at: string | null = null
  if (input.expires_at) {
    const d = new Date(input.expires_at)
    if (Number.isNaN(d.getTime())) return { success: false, error: '만료일이 올바르지 않습니다' }
    expires_at = d.toISOString()
  }

  const supabase = await createSupabaseAdmin()
  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code,
      plan,
      free_months,
      max_uses,
      used_count: 0,
      expires_at,
      lead_id: input.lead_id || null,
      memo: (input.memo ?? '').trim() || null,
      created_by: auth.ctx.user_id,
    })
    .select('id, code')
    .single()

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { success: false, error: '이미 존재하는 코드입니다' }
    }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/sales/promo')
  return { success: true, data: { id: data.id as string, code: data.code as string } }
}

/**
 * 코드 목록 + 사용현황.
 * 코드 건수와 무관하게 쿼리 3회 (coupons / coupon_uses / 이름 조회) — 행당 조회 없음.
 */
export async function listPromoCodes(): Promise<
  ActionResult<{ codes: PromoCodeRow[]; usage: PromoUsageRow[] }>
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const { data: coupons, error } = await supabase
    .from('coupons')
    .select('id, code, plan, free_months, max_uses, used_count, expires_at, created_at, lead_id, memo')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  const rows = (coupons ?? []) as Array<{
    id: string
    code: string
    plan: string
    free_months: number
    max_uses: number | null
    used_count: number | null
    expires_at: string | null
    created_at: string
    lead_id: string | null
    memo: string | null
  }>

  if (rows.length === 0) return { success: true, data: { codes: [], usage: [] } }

  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((v): v is string => !!v)))

  const [{ data: uses, error: useErr }, { data: leads, error: leadErr }] = await Promise.all([
    supabase
      .from('coupon_uses')
      .select('coupon_id, tenant_id, used_at, plan_expires_at')
      .in(
        'coupon_id',
        rows.map((r) => r.id),
      )
      .order('used_at', { ascending: false }),
    leadIds.length > 0
      ? supabase.from('sales_leads').select('id, company_name').in('id', leadIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (useErr) return { success: false, error: useErr.message }
  if (leadErr) return { success: false, error: leadErr.message }

  const leadName = new Map(
    ((leads ?? []) as Array<{ id: string; company_name: string }>).map((l) => [l.id, l.company_name]),
  )

  const useRows = (uses ?? []) as Array<{
    coupon_id: string
    tenant_id: string
    used_at: string
    plan_expires_at: string
  }>

  const tenantIds = Array.from(new Set(useRows.map((u) => u.tenant_id)))
  let tenantName = new Map<string, string>()
  if (tenantIds.length > 0) {
    const { data: tenants } = await supabase.from('tenants').select('id, name').in('id', tenantIds)
    tenantName = new Map(
      ((tenants ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
    )
  }

  const now = Date.now()
  const codes: PromoCodeRow[] = rows.map((r) => {
    const used = r.used_count ?? 0
    return {
      id: r.id,
      code: r.code,
      plan: r.plan,
      free_months: r.free_months,
      max_uses: r.max_uses,
      used_count: used,
      expires_at: r.expires_at,
      created_at: r.created_at,
      lead_id: r.lead_id,
      lead_name: r.lead_id ? (leadName.get(r.lead_id) ?? null) : null,
      memo: r.memo,
      is_expired: !!r.expires_at && new Date(r.expires_at).getTime() <= now,
      is_exhausted: r.max_uses !== null && used >= r.max_uses,
    }
  })

  const usage: PromoUsageRow[] = useRows.map((u) => ({
    coupon_id: u.coupon_id,
    tenant_id: u.tenant_id,
    tenant_name: tenantName.get(u.tenant_id) ?? null,
    used_at: u.used_at,
    plan_expires_at: u.plan_expires_at,
  }))

  return { success: true, data: { codes, usage } }
}

/** 코드 발급 시 "어느 리드에 준 코드인지" 고르기 위한 목록 */
export async function listLeadsForPromo(): Promise<
  ActionResult<{ leads: Array<{ id: string; company_name: string; lead_type: string }> }>
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()
  const { data, error } = await supabase
    .from('sales_leads')
    .select('id, company_name, lead_type')
    .order('company_name', { ascending: true })
    .limit(1000)

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: {
      leads: (data ?? []) as Array<{ id: string; company_name: string; lead_type: string }>,
    },
  }
}

/** 사용 이력이 있는 코드는 지우지 않는다 — 정산·문의 추적이 끊긴다 */
export async function deletePromoCode(id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const { count, error: countErr } = await supabase
    .from('coupon_uses')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', id)

  if (countErr) return { success: false, error: countErr.message }
  if ((count ?? 0) > 0) {
    return { success: false, error: '이미 사용된 코드는 삭제할 수 없습니다' }
  }

  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/sales/promo')
  return { success: true }
}
