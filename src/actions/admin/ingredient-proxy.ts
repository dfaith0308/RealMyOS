'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

type ActionResult<T = void> = { success: boolean; data?: T; error?: string }

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

/** 식당OS 와 같은 단위 집합. 목록에 없으면 kg 로 떨어뜨린다. */
const INGREDIENT_UNITS = ['kg', 'g', 'L', 'ml', '개', '박스', '봉지', '팩'] as const
type IngredientUnit = (typeof INGREDIENT_UNITS)[number]

function resolveUnit(unit: string | null | undefined): IngredientUnit {
  const u = (unit ?? '').trim()
  return (INGREDIENT_UNITS as readonly string[]).includes(u) ? (u as IngredientUnit) : 'kg'
}

function todayKstDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
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
    old_value?: unknown
    new_value?: unknown
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('admin_logs').insert({
    admin_tenant_id: PLATFORM_OWNER_TENANT,
    admin_id: input.admin_id,
    tenant_id: input.tenant_id ?? null,
    action_type: input.action_type,
    reason: input.reason ?? null,
    target_table: input.target_table ?? null,
    target_id: input.target_id ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type ProxyTenantOption = {
  id: string
  name: string | null
  representative_name: string | null
  contact_phone: string | null
  ingredient_count: number
}

/**
 * 대리 등록 대상이 될 수 있는 식당 목록.
 *
 * 식자재 보유 건수를 함께 준다 — 관리자가 "이 집은 아직 하나도 없네" 를 보고
 * 대상을 고를 수 있어야 하기 때문이다.
 * 식당 수만큼 쿼리를 돌리지 않는다(ARCH-01 전제 7). ingredients 를 한 번에 읽어 집계한다.
 */
export async function getProxyTargetRestaurants(): Promise<
  ActionResult<{ tenants: ProxyTenantOption[] }>
> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = await createSupabaseAdmin()

  const { data: tenants, error: tErr } = await admin
    .from('tenants')
    .select('id, name, representative_name, contact_phone')
    .eq('role', 'restaurant')
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (tErr) return { success: false, error: tErr.message }
  const rows = (tenants ?? []) as Array<{
    id: string
    name: string | null
    representative_name: string | null
    contact_phone: string | null
  }>
  if (rows.length === 0) return { success: true, data: { tenants: [] } }

  const ids = rows.map(r => r.id)
  const { data: ings, error: iErr } = await admin
    .from('ingredients')
    .select('tenant_id')
    .in('tenant_id', ids)
    .eq('is_active', true)

  if (iErr) return { success: false, error: iErr.message }

  const counts = new Map<string, number>()
  for (const r of (ings ?? []) as Array<{ tenant_id: string }>) {
    counts.set(r.tenant_id, (counts.get(r.tenant_id) ?? 0) + 1)
  }

  return {
    success: true,
    data: {
      tenants: rows.map(r => ({
        id: r.id,
        name: r.name,
        representative_name: r.representative_name,
        contact_phone: r.contact_phone,
        ingredient_count: counts.get(r.id) ?? 0,
      })),
    },
  }
}

export type ProxyIngredientRow = {
  id: string
  name: string
  unit: string | null
  current_price: number | null
  category: string | null
  created_at: string | null
  created_by_admin_id: string | null
}

/** 대상 식당이 현재 갖고 있는 식자재 — 중복 입력을 막기 위해 보여준다. */
export async function getIngredientsOfTenant(
  target_tenant_id: string,
): Promise<ActionResult<{ items: ProxyIngredientRow[] }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const tenant_id = target_tenant_id?.trim()
  if (!tenant_id) return { success: false, error: '거래처를 선택해주세요.' }

  const admin = await createSupabaseAdmin()
  const { data, error } = await admin
    .from('ingredients')
    .select('id, name, unit, current_price, category, created_at, created_by_admin_id')
    .eq('tenant_id', tenant_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { success: false, error: error.message }
  return { success: true, data: { items: (data ?? []) as ProxyIngredientRow[] } }
}

/**
 * 관리자가 거래처(식당) 대신 식자재를 등록한다.
 *
 * 중요 — 대리 로그인이 아니다.
 * 관리자는 자기 세션 그대로이고, 대상 tenant 를 파라미터로 지정한다.
 * 고객 계정의 비밀번호를 알거나 그 계정으로 로그인하는 경로는 어디에도 없다.
 *
 * 권한: requireAdmin 을 통과한 호출만 target_tenant_id 를 쓸 수 있다.
 * 식당OS 의 createIngredient() 는 손대지 않았다 — 그쪽은 지금도 로그인한 본인
 * tenant 로만 저장한다.
 */
export async function createIngredientForTenant(input: {
  target_tenant_id: string
  name: string
  unit?: string | null
  current_price?: number | null
  category?: string | null
  memo?: string | null
  reason?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const target_tenant_id = input.target_tenant_id?.trim()
  const name = (input.name ?? '').trim()
  if (!target_tenant_id) return { success: false, error: '거래처를 선택해주세요.' }
  if (!name) return { success: false, error: '품명은 필수입니다.' }
  if (name.length > 200) return { success: false, error: '품명이 너무 깁니다.' }

  const unit = resolveUnit(input.unit)

  let current_price: number | null = null
  if (input.current_price != null && `${input.current_price}` !== '') {
    const n = Number(input.current_price)
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return { success: false, error: '가격은 정수로 입력해주세요.' }
    }
    if (n < 0) return { success: false, error: '가격은 0 이상이어야 합니다.' }
    // ingredients.current_price 는 int4 다. 범위를 넘기면 DB 까지 내려가 터진다.
    if (n > 2_000_000_000) return { success: false, error: '가격이 너무 큽니다.' }
    current_price = n
  }

  const admin = await createSupabaseAdmin()

  // 대상이 실제로 존재하는 식당인지 확인한다. 관리자 tenant 나 공급자에는 넣지 않는다.
  const { data: target, error: tErr } = await admin
    .from('tenants')
    .select('id, name, role')
    .eq('id', target_tenant_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (tErr) return { success: false, error: tErr.message }
  if (!target) return { success: false, error: '거래처를 찾을 수 없습니다.' }
  if ((target as { role?: string | null }).role !== 'restaurant') {
    return { success: false, error: '식당 계정에만 등록할 수 있습니다.' }
  }

  const { data: created, error: insErr } = await admin
    .from('ingredients')
    .insert({
      tenant_id: target_tenant_id,
      name,
      unit,
      category: input.category?.trim() || null,
      current_price,
      memo: input.memo?.trim() || null,
      is_active: true,
      created_by_admin_id: auth.ctx.user_id,
    })
    .select('id')
    .single()

  if (insErr || !created) return { success: false, error: insErr?.message ?? '저장 실패' }

  // 가격·단위 이력. service role 이라 RLS 와 무관하게 기록된다.
  // 실패해도 식자재 저장을 되돌리지는 않되, 삼키지 않고 남긴다.
  const effective_from = todayKstDateString()
  if (current_price != null && current_price > 0) {
    const { error: phErr } = await admin.from('ingredient_price_history').insert({
      tenant_id: target_tenant_id,
      ingredient_id: created.id,
      price: current_price,
      effective_from,
    })
    if (phErr) console.error('[ingredient-proxy] 가격 이력 기록 실패', phErr.message)
  }
  const { error: uhErr } = await admin.from('ingredient_unit_history').insert({
    tenant_id: target_tenant_id,
    ingredient_id: created.id,
    unit,
    effective_from,
  })
  if (uhErr) console.error('[ingredient-proxy] 단위 이력 기록 실패', uhErr.message)

  // 누가 어느 거래처 대신 넣었는지 남긴다. 기록 실패면 등록을 되돌린다.
  const logRes = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    action_type: 'ingredient_proxy_create',
    tenant_id: target_tenant_id,
    reason: input.reason?.trim() || '관리자 대리 등록',
    target_table: 'ingredients',
    target_id: created.id,
    old_value: null,
    new_value: {
      tenant_id: target_tenant_id,
      tenant_name: (target as { name?: string | null }).name ?? null,
      name,
      unit,
      current_price,
      category: input.category?.trim() || null,
    },
  })

  if (!logRes.ok) {
    await admin.from('ingredients').delete().eq('id', created.id)
    return { success: false, error: `admin_logs 기록 실패: ${logRes.error}` }
  }

  revalidatePath('/admin/ingredient-entry')
  return { success: true, data: { id: created.id } }
}
