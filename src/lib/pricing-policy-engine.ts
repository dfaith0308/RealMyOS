/**
 * DISCOUNT-ENGINE-P0-001 — 가격정책 우선순위·적용 (체크아웃 RPC JSON과 동일 규칙 유지)
 */

export type PricingPolicyType = 'fixed_price' | 'amount_discount' | 'percent_discount'

export type PricingPolicyTargetRow = {
  id: string
  listing_id: string | null
  restaurant_tenant_id: string | null
  supplier_tenant_id: string | null
  applies_to_all: boolean
}

export type PricingPolicyRow = {
  id: string
  name: string
  policy_type: PricingPolicyType
  burden_type: string
  discount_value: number
  platform_fee_rate_override: number | null
  priority: number
  targets: PricingPolicyTargetRow[]
}

/** 단일 타깃과 주문 라인(listing + 식당 + 선택 공급자) 매칭 시 우선순위 티어 (숫자 작을수록 우선) */
export function matchTargetTier(
  listingId: string,
  restaurantTenantId: string,
  supplierTenantId: string | null | undefined,
  t: PricingPolicyTargetRow,
): number | null {
  if (t.applies_to_all) return 5
  const lid = t.listing_id
  const rid = t.restaurant_tenant_id
  const sid = t.supplier_tenant_id
  const hasL = lid != null && lid !== ''
  const hasR = rid != null && rid !== ''
  const hasS = sid != null && sid !== ''

  if (hasL && hasR && lid === listingId && rid === restaurantTenantId) return 1
  if (hasR && !hasL && !hasS && rid === restaurantTenantId) return 2
  if (hasL && !hasR && !hasS && lid === listingId) return 3
  if (hasS && !hasL && !hasR && supplierTenantId && sid === supplierTenantId) return 4
  return null
}

export function bestTierForPolicyOnLine(
  listingId: string,
  restaurantTenantId: string,
  supplierTenantId: string | null | undefined,
  policy: PricingPolicyRow,
): number | null {
  let best: number | null = null
  for (const tg of policy.targets ?? []) {
    const tier = matchTargetTier(listingId, restaurantTenantId, supplierTenantId, tg)
    if (tier == null) continue
    if (best == null || tier < best) best = tier
  }
  return best
}

export function getApplicablePricingPolicy(
  listingId: string,
  restaurantTenantId: string,
  policies: PricingPolicyRow[],
  supplierTenantId?: string | null,
): PricingPolicyRow | null {
  type Cand = { policy: PricingPolicyRow; tier: number }
  const cands: Cand[] = []
  for (const policy of policies) {
    const tier = bestTierForPolicyOnLine(listingId, restaurantTenantId, supplierTenantId, policy)
    if (tier == null) continue
    cands.push({ policy, tier })
  }
  if (cands.length === 0) return null
  cands.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.policy.priority !== b.policy.priority) return b.policy.priority - a.policy.priority
    return a.policy.id.localeCompare(b.policy.id)
  })
  return cands[0]!.policy
}

export function batchApplicablePoliciesByListingId(
  listingIds: string[],
  restaurantTenantId: string,
  policies: PricingPolicyRow[],
  supplierByListingId?: ReadonlyMap<string, string | null>,
): Map<string, PricingPolicyRow | null> {
  const m = new Map<string, PricingPolicyRow | null>()
  for (const lid of listingIds) {
    const sup = supplierByListingId?.get(lid)
    m.set(lid, getApplicablePricingPolicy(lid, restaurantTenantId, policies, sup))
  }
  return m
}

export function applyPricingPolicy(basePrice: number, policy: PricingPolicyRow | null): number {
  const b = Math.round(Number(basePrice))
  if (!Number.isFinite(b) || b < 0) return 0
  if (!policy) return Math.max(0, b)
  const dv = Number(policy.discount_value)
  if (!Number.isFinite(dv)) return Math.max(0, b)

  let out: number
  switch (policy.policy_type) {
    case 'fixed_price':
      out = Math.round(dv)
      break
    case 'amount_discount':
      out = Math.round(b - dv)
      break
    case 'percent_discount':
      out = Math.round(b * (1 - dv / 100))
      break
    default:
      out = b
  }
  return Math.max(0, out)
}

export function buildAppliedPolicySnapshot(policy: PricingPolicyRow): Record<string, unknown> {
  return {
    policy_id: policy.id,
    policy_type: policy.policy_type,
    discount_value: policy.discount_value,
    priority: policy.priority,
    burden_type: policy.burden_type,
    name: policy.name,
    platform_fee_rate_override: policy.platform_fee_rate_override,
  }
}

export function parsePricingPoliciesFromRpcJson(raw: unknown): PricingPolicyRow[] {
  if (!Array.isArray(raw)) return []
  const out: PricingPolicyRow[] = []
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue
    const o = el as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : null
    const name = typeof o.name === 'string' ? o.name : ''
    const policy_type = o.policy_type as PricingPolicyType
    if (!id || (policy_type !== 'fixed_price' && policy_type !== 'amount_discount' && policy_type !== 'percent_discount')) {
      continue
    }
    const targetsRaw = o.targets
    const targets: PricingPolicyTargetRow[] = []
    if (Array.isArray(targetsRaw)) {
      for (const tr of targetsRaw) {
        if (!tr || typeof tr !== 'object') continue
        const t = tr as Record<string, unknown>
        const tid = typeof t.id === 'string' ? t.id : ''
        if (!tid) continue
        targets.push({
          id: tid,
          listing_id: typeof t.listing_id === 'string' ? t.listing_id : null,
          restaurant_tenant_id: typeof t.restaurant_tenant_id === 'string' ? t.restaurant_tenant_id : null,
          supplier_tenant_id: typeof t.supplier_tenant_id === 'string' ? t.supplier_tenant_id : null,
          applies_to_all: t.applies_to_all === true,
        })
      }
    }
    const dv = o.discount_value
    const discount_value = typeof dv === 'number' ? dv : typeof dv === 'string' ? Number(dv) : 0
    const pr = o.priority
    const priority = typeof pr === 'number' && Number.isFinite(pr) ? pr : Number(pr) || 0
    const pfo = o.platform_fee_rate_override
    const platform_fee_rate_override =
      pfo == null
        ? null
        : typeof pfo === 'number' && Number.isFinite(pfo)
          ? pfo
          : typeof pfo === 'string'
            ? Number(pfo)
            : null

    out.push({
      id,
      name,
      policy_type,
      burden_type: typeof o.burden_type === 'string' ? o.burden_type : 'platform',
      discount_value: Number.isFinite(discount_value) ? discount_value : 0,
      platform_fee_rate_override:
        platform_fee_rate_override != null && Number.isFinite(platform_fee_rate_override)
          ? platform_fee_rate_override
          : null,
      priority,
      targets,
    })
  }
  return out
}
