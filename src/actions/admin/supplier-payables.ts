'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

async function requireAdmin(supabase: any) {
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false as const, error: '로그인 필요' }
  if (ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export type SupplierPayableListRow = {
  id: string
  supplier_tenant_id: string
  supplier_name: string | null
  commerce_order_id: string
  commerce_order_item_id: string
  commerce_order_allocation_id: string
  order_number: string | null
  listing_title: string | null
  payable_amount: number
  item_amount: number
  platform_fee_amount: number
  status: string
  confirmed_at: string | null
  paid_at: string | null
  created_at: string
}

export type SupplierPayableSupplierSummary = {
  supplier_tenant_id: string
  supplier_name: string | null
  unpaid_sum: number
  paid_sum: number
  row_count: number
}

export type SupplierPayablesAdminPayload = {
  kpis: {
    total_unpaid: number
    total_paid: number
    supplier_count: number
    unpaid_row_count: number
  }
  summaries: SupplierPayableSupplierSummary[]
  rows: SupplierPayableListRow[]
}

export async function getSupplierPayablesAdminData(
  status: 'all' | 'unpaid' | 'paid' | 'cancelled',
): Promise<ActionResult<SupplierPayablesAdminPayload>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const { data: aggRaw, error: aggErr } = await supabase
    .from('supplier_payables')
    .select('supplier_tenant_id, status, payable_amount')
    .limit(25000)

  if (aggErr) return { success: false, error: aggErr.message }

  const agg = (aggRaw ?? []) as { supplier_tenant_id: string; status: string; payable_amount: number }[]
  let total_unpaid = 0
  let total_paid = 0
  let unpaid_row_count = 0
  const supplierSet = new Set<string>()
  const sumBySupplier = new Map<string, { unpaid: number; paid: number; count: number }>()

  for (const r of agg) {
    supplierSet.add(r.supplier_tenant_id)
    const cur = sumBySupplier.get(r.supplier_tenant_id) ?? { unpaid: 0, paid: 0, count: 0 }
    cur.count += 1
    if (r.status === 'unpaid') {
      total_unpaid += r.payable_amount
      unpaid_row_count += 1
      cur.unpaid += r.payable_amount
    }
    if (r.status === 'paid') {
      total_paid += r.payable_amount
      cur.paid += r.payable_amount
    }
    sumBySupplier.set(r.supplier_tenant_id, cur)
  }

  let q = supabase
    .from('supplier_payables')
    .select(
      `
      id,
      commerce_order_id,
      commerce_order_item_id,
      commerce_order_allocation_id,
      supplier_tenant_id,
      item_amount,
      platform_fee_amount,
      payable_amount,
      status,
      confirmed_at,
      paid_at,
      created_at,
      commerce_orders ( order_number ),
      commerce_order_items ( listing_title )
    `,
    )
    .order('created_at', { ascending: false })
    .limit(2000)

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data, error } = await q
  if (error) return { success: false, error: error.message }

  const raw = (data ?? []) as {
    id: string
    commerce_order_id: string
    commerce_order_item_id: string
    commerce_order_allocation_id: string
    supplier_tenant_id: string
    item_amount: number
    platform_fee_amount: number
    payable_amount: number
    status: string
    confirmed_at: string | null
    paid_at: string | null
    created_at: string
    commerce_orders: { order_number: string | null } | { order_number: string | null }[] | null
    commerce_order_items: { listing_title: string | null } | { listing_title: string | null }[] | null
  }[]

  const supplierIdsForNames = [...new Set([...sumBySupplier.keys(), ...raw.map((r) => r.supplier_tenant_id)])]
  const nameMap = new Map<string, string | null>()
  if (supplierIdsForNames.length) {
    const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, name').in('id', supplierIdsForNames)
    if (tErr) return { success: false, error: tErr.message }
    for (const t of (tenants ?? []) as { id: string; name: string | null }[]) {
      nameMap.set(t.id, t.name ?? null)
    }
  }

  const rows: SupplierPayableListRow[] = raw.map((r) => {
    const on = r.commerce_orders
    const order_number = Array.isArray(on) ? on[0]?.order_number ?? null : on?.order_number ?? null
    const it = r.commerce_order_items
    const listing_title = Array.isArray(it) ? it[0]?.listing_title ?? null : it?.listing_title ?? null
    return {
      id: r.id,
      supplier_tenant_id: r.supplier_tenant_id,
      supplier_name: nameMap.get(r.supplier_tenant_id) ?? null,
      commerce_order_id: r.commerce_order_id,
      commerce_order_item_id: r.commerce_order_item_id,
      commerce_order_allocation_id: r.commerce_order_allocation_id,
      order_number,
      listing_title,
      payable_amount: r.payable_amount,
      item_amount: r.item_amount,
      platform_fee_amount: r.platform_fee_amount,
      status: r.status,
      confirmed_at: r.confirmed_at ?? null,
      paid_at: r.paid_at ?? null,
      created_at: r.created_at,
    }
  })

  const summaries: SupplierPayableSupplierSummary[] = [...sumBySupplier.entries()].map(([supplier_tenant_id, v]) => ({
    supplier_tenant_id,
    supplier_name: nameMap.get(supplier_tenant_id) ?? null,
    unpaid_sum: v.unpaid,
    paid_sum: v.paid,
    row_count: v.count,
  }))
  summaries.sort((a, b) => b.unpaid_sum + b.paid_sum - (a.unpaid_sum + a.paid_sum))

  return {
    success: true,
    data: {
      kpis: {
        total_unpaid,
        total_paid,
        supplier_count: supplierSet.size,
        unpaid_row_count,
      },
      summaries,
      rows,
    },
  }
}
