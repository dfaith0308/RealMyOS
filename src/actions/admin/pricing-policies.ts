'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import {
  applyPricingPolicy,
  getApplicablePricingPolicy,
  type PricingPolicyRow,
} from '@/lib/pricing-policy-engine'

export type { PricingPolicyRow } from '@/lib/pricing-policy-engine'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export type AdminPricingPolicyListRow = {
  id: string
  name: string
  policy_type: string
  discount_value: number
  priority: number
  status: string
  starts_at: string | null
  ends_at: string | null
  targets_summary: string
}

export type PricingFormOptionRow = { id: string; name: string }
export type PricingFormListingRow = { id: string; label: string }

export async function getPricingPolicyFormOptions(): Promise<
  ActionResult<{ restaurants: PricingFormOptionRow[]; listings: PricingFormListingRow[] }>
> {
  const supabase = await createSupabaseServer()
  const gate = await requireAdmin(supabase)
  if (!gate.ok) return { success: false, error: gate.error }

  const [{ data: tenants, error: te }, { data: listingRows, error: le }] = await Promise.all([
    supabase.from('tenants').select('id, name').eq('role', 'restaurant').order('name', { ascending: true }).limit(800),
    supabase
      .from('commerce_product_listings')
      .select('id, commerce_price, products ( name )')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(400),
  ])

  if (te) return { success: false, error: te.message }
  if (le) return { success: false, error: le.message }

  const restaurants: PricingFormOptionRow[] = (tenants ?? []).map((r: { id: string; name: string | null }) => ({
    id: r.id,
    name: (r.name && String(r.name).trim()) || r.id,
  }))

  const listings: PricingFormListingRow[] = (listingRows ?? []).map((row: Record<string, unknown>) => {
    const id = row.id as string
    const price = row.commerce_price as number
    const rawP = row.products
    const p = Array.isArray(rawP) ? rawP[0] : rawP
    const nm = p && typeof p === 'object' && 'name' in p ? String((p as { name?: string }).name ?? '').trim() : ''
    return { id, label: nm ? `${nm} (${price}원)` : `${id.slice(0, 8)}… (${price}원)` }
  })

  return { success: true, data: { restaurants, listings } }
}

export async function listPricingPoliciesAdmin(): Promise<ActionResult<{ rows: AdminPricingPolicyListRow[] }>> {
  const supabase = await createSupabaseServer()
  const gate = await requireAdmin(supabase)
  if (!gate.ok) return { success: false, error: gate.error }

  const { data, error } = await supabase
    .from('pricing_policies')
    .select(
      `
      id,
      name,
      policy_type,
      discount_value,
      priority,
      status,
      starts_at,
      ends_at,
      pricing_policy_targets (
        listing_id,
        restaurant_tenant_id,
        supplier_tenant_id,
        applies_to_all
      )
    `,
    )
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { success: false, error: error.message }

  const rows: AdminPricingPolicyListRow[] = (data ?? []).map((raw: Record<string, unknown>) => {
    const targets = (raw.pricing_policy_targets as Record<string, unknown>[] | null) ?? []
    const parts: string[] = []
    for (const t of targets) {
      if (t.applies_to_all === true) {
        parts.push('전체')
        continue
      }
      const bits: string[] = []
      if (t.listing_id) bits.push(`listing=${String(t.listing_id).slice(0, 8)}…`)
      if (t.restaurant_tenant_id) bits.push(`식당=${String(t.restaurant_tenant_id).slice(0, 8)}…`)
      if (t.supplier_tenant_id) bits.push(`공급=${String(t.supplier_tenant_id).slice(0, 8)}…`)
      if (bits.length) parts.push(bits.join('+'))
    }
    return {
      id: raw.id as string,
      name: raw.name as string,
      policy_type: raw.policy_type as string,
      discount_value: Number(raw.discount_value),
      priority: Number(raw.priority),
      status: raw.status as string,
      starts_at: (raw.starts_at as string | null) ?? null,
      ends_at: (raw.ends_at as string | null) ?? null,
      targets_summary: parts.length ? parts.join(' | ') : '(타깃 없음)',
    }
  })

  return { success: true, data: { rows } }
}

export type CreatePricingPolicyAdminInput = {
  name: string
  policy_type: 'fixed_price' | 'amount_discount' | 'percent_discount'
  discount_value: number
  priority: number
  starts_at: string | null
  ends_at: string | null
  listing_id: string | null
  restaurant_tenant_id: string | null
  applies_to_all: boolean
}

export async function createPricingPolicyAdmin(
  input: CreatePricingPolicyAdminInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const gate = await requireAdmin(supabase)
  if (!gate.ok) return { success: false, error: gate.error }

  const name = input.name?.trim()
  if (!name) return { success: false, error: '이름이 필요합니다' }

  const listing_id = input.listing_id?.trim() || null
  const restaurant_tenant_id = input.restaurant_tenant_id?.trim() || null

  if (!input.applies_to_all && !listing_id && !restaurant_tenant_id) {
    return { success: false, error: '타깃을 선택하거나 「전체 적용」을 켜 주세요' }
  }

  const { data: ins, error: pErr } = await supabase
    .from('pricing_policies')
    .insert({
      name,
      policy_type: input.policy_type,
      discount_value: input.discount_value,
      priority: input.priority,
      starts_at: input.starts_at?.trim() || null,
      ends_at: input.ends_at?.trim() || null,
      status: 'active',
      created_by: gate.ctx.user_id,
    })
    .select('id')
    .single()

  if (pErr || !ins?.id) return { success: false, error: pErr?.message ?? '정책 생성 실패' }

  const pid = ins.id as string

  const { error: tErr } = await supabase.from('pricing_policy_targets').insert({
    pricing_policy_id: pid,
    listing_id: input.applies_to_all ? null : listing_id,
    restaurant_tenant_id: input.applies_to_all ? null : restaurant_tenant_id,
    supplier_tenant_id: null,
    applies_to_all: input.applies_to_all,
  })

  if (tErr) {
    await supabase.from('pricing_policies').delete().eq('id', pid)
    return { success: false, error: tErr.message }
  }

  revalidatePath('/admin/commerce/pricing')
  return { success: true, data: { id: pid } }
}

export async function setPricingPolicyStatusAdmin(
  id: string,
  status: 'active' | 'inactive',
): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const gate = await requireAdmin(supabase)
  if (!gate.ok) return { success: false, error: gate.error }

  const pid = String(id ?? '').trim()
  if (!pid) return { success: false, error: 'ID가 필요합니다' }

  const { error } = await supabase.from('pricing_policies').update({ status, updated_at: new Date().toISOString() }).eq('id', pid)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/commerce/pricing')
  return { success: true }
}

/** 관리자·테스트용: 단일 라인에 대한 승자 정책 (DB 직접 조회 + 엔진 규칙) */
export async function getApplicablePricingPolicyAdminPreview(
  listingId: string,
  restaurantTenantId: string,
): Promise<ActionResult<{ policy: PricingPolicyRow | null }>> {
  const supabase = await createSupabaseServer()
  const gate = await requireAdmin(supabase)
  if (!gate.ok) return { success: false, error: gate.error }

  const lid = listingId?.trim()
  const rid = restaurantTenantId?.trim()
  if (!lid || !rid) return { success: false, error: 'listing_id·restaurant_tenant_id 필요' }

  const { data, error } = await supabase
    .from('pricing_policies')
    .select(
      `
      id,
      name,
      policy_type,
      burden_type,
      discount_value,
      platform_fee_rate_override,
      priority,
      starts_at,
      ends_at,
      pricing_policy_targets (
        id,
        listing_id,
        restaurant_tenant_id,
        supplier_tenant_id,
        applies_to_all
      )
    `,
    )
    .eq('status', 'active')

  if (error) return { success: false, error: error.message }

  const now = Date.now()
  const policies: PricingPolicyRow[] = (data ?? [])
    .filter((raw: Record<string, unknown>) => {
      const starts = raw.starts_at as string | null | undefined
      const ends = raw.ends_at as string | null | undefined
      if (starts) {
        const t = Date.parse(starts)
        if (Number.isFinite(t) && t > now) return false
      }
      if (ends) {
        const t = Date.parse(ends)
        if (Number.isFinite(t) && t < now) return false
      }
      return true
    })
    .map((raw: Record<string, unknown>) => {
      const targetsRaw = (raw.pricing_policy_targets as Record<string, unknown>[] | null) ?? []
      const targets = targetsRaw.map((t) => ({
        id: String(t.id),
        listing_id: (t.listing_id as string | null) ?? null,
        restaurant_tenant_id: (t.restaurant_tenant_id as string | null) ?? null,
        supplier_tenant_id: (t.supplier_tenant_id as string | null) ?? null,
        applies_to_all: t.applies_to_all === true,
      }))
      return {
        id: raw.id as string,
        name: raw.name as string,
        policy_type: raw.policy_type as PricingPolicyRow['policy_type'],
        burden_type: String(raw.burden_type ?? 'platform'),
        discount_value: Number(raw.discount_value),
        platform_fee_rate_override:
          raw.platform_fee_rate_override == null ? null : Number(raw.platform_fee_rate_override),
        priority: Number(raw.priority),
        targets,
      }
    })

  const winner = getApplicablePricingPolicy(lid, rid, policies, null)
  return { success: true, data: { policy: winner } }
}

export { applyPricingPolicy, getApplicablePricingPolicy }
