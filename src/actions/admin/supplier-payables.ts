'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import {
  PAYMENTS_TYPE_PAYOUT_OUTBOUND,
} from '@/lib/inbound-payment-superseded'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

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
    admin_tenant_id?: string
    tenant_id?: string | null
    action_type: string
    reason?: string | null
    target_table?: string | null
    target_id?: string | null
    old_value?: unknown
    new_value?: unknown
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin_tenant_id = input.admin_tenant_id ?? PLATFORM_OWNER_TENANT
  const { error } = await supabase.from('admin_logs').insert({
    admin_tenant_id,
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
  paid_by: string | null
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
      paid_by,
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
    paid_by: string | null
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
      paid_by: r.paid_by ?? null,
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

/**
 * [D-023] paid = 실제 지급 finality: `supplier_payables` → paid + append-only `payments` outbound(`payout_outbound`).
 * settlement 자동화·배치 지급·PG 없음. payout INSERT 실패 시 payable paid 롤백(unpaid).
 */
export async function markSupplierPayableAsPaid(
  payable_id: string,
  reason: string,
  /** D-022: 명시 없으면 taxonomy 기본값 + `payment_type_missing_rejected` 감사(INSERT는 계속 진행) */
  payments_type_override?: string | null,
): Promise<ActionResult<{ payout_payment_id: string; already_done?: boolean }>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }

  const pid = String(payable_id ?? '').trim()
  const userReasonTrim = String(reason ?? '').trim().slice(0, 500)
  const memoDefault = `공급자 지급 완료: ${pid}`
  const paymentMemo = userReasonTrim.length > 0 ? userReasonTrim : memoDefault
  const rsn = userReasonTrim.length > 0 ? userReasonTrim : 'mark_supplier_payable_paid'
  if (!pid) return { success: false, error: 'payable ID가 필요합니다' }

  const rawOverride =
    payments_type_override != null && String(payments_type_override).trim() !== ''
      ? String(payments_type_override).trim().slice(0, 64)
      : ''
  const resolvedPaymentType = rawOverride || PAYMENTS_TYPE_PAYOUT_OUTBOUND
  /** 중복·멱등 조회용(금액·memo 가변 시에도 payable 단위 식별) */
  const payoutMemoKey = memoDefault
  const nowIso = new Date().toISOString()
  const paymentDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

  const { data: row, error: gErr } = await supabase
    .from('supplier_payables')
    .select('id, status, payable_amount, supplier_tenant_id, commerce_order_id, commerce_order_allocation_id, note')
    .eq('id', pid)
    .maybeSingle()

  if (gErr) return { success: false, error: gErr.message }
  if (!row) return { success: false, error: 'payable을 찾을 수 없습니다' }

  const pr = row as {
    id: string
    status: string
    payable_amount: number
    supplier_tenant_id: string
    commerce_order_id: string
    commerce_order_allocation_id: string
    note: string | null
  }
  const prevNote = pr.note ?? null
  const payoutMemosForLookup = [...new Set([payoutMemoKey, paymentMemo].filter((m) => m.length > 0))]

  if (pr.status === 'paid') {
    const { data: existingRows } = await supabase
      .from('payments')
      .select('id')
      .in('memo', payoutMemosForLookup)
      .eq('direction', 'outbound')
      .limit(1)
    const existingPay = existingRows?.[0] as { id: string } | undefined
    if (existingPay?.id) {
      return { success: true, data: { payout_payment_id: String(existingPay.id), already_done: true } }
    }
    return { success: false, error: '이미 paid인데 payout payments 행이 없습니다. 수동 검토가 필요합니다.' }
  }

  if (pr.status === 'cancelled') {
    return { success: false, error: '취소된 payable은 지급 완료 처리할 수 없습니다.' }
  }

  if (pr.status !== 'unpaid') {
    return { success: false, error: `지급 완료 처리할 수 없는 상태입니다: ${pr.status}` }
  }

  if (!Number.isFinite(pr.payable_amount) || pr.payable_amount <= 0) {
    return { success: false, error: 'payable_amount가 유효하지 않습니다.' }
  }

  const { data: dupRows, error: dupErr } = await supabase
    .from('payments')
    .select('id')
    .in('memo', payoutMemosForLookup)
    .eq('direction', 'outbound')
    .limit(2)
  if (dupErr) return { success: false, error: dupErr.message }
  if (dupRows?.length) {
    return { success: false, error: '동일 payable에 대한 payout 기록이 이미 있습니다. 수동 검토가 필요합니다.' }
  }

  const { data: tn } = await supabase.from('tenants').select('name').eq('id', pr.supplier_tenant_id).maybeSingle()
  const counterparty_name =
    String((tn as { name?: string | null } | null)?.name ?? '').trim() || 'Supplier'

  const paidRowUpdate: Record<string, unknown> = {
    status: 'paid',
    paid_at: nowIso,
    paid_by: auth.ctx.user_id,
    updated_at: nowIso,
  }
  if (userReasonTrim.length > 0) {
    paidRowUpdate.note = userReasonTrim
  }

  const { error: uErr, data: updRows } = await supabase
    .from('supplier_payables')
    .update(paidRowUpdate)
    .eq('id', pid)
    .eq('status', 'unpaid')
    .select('id')

  if (uErr) return { success: false, error: uErr.message }
  if (!updRows?.length) {
    return { success: false, error: '동시 갱신으로 payable을 paid로 바꾸지 못했습니다. 다시 시도하세요.' }
  }

  const payPayload: Record<string, unknown> = {
    tenant_id: PLATFORM_OWNER_TENANT,
    payer_tenant_id: PLATFORM_OWNER_TENANT,
    payee_tenant_id: pr.supplier_tenant_id,
    direction: 'outbound',
    status: 'confirmed',
    amount: pr.payable_amount,
    payment_method: 'platform',
    payment_date: paymentDate,
    memo: paymentMemo,
    deposit_amount: 0,
    reversal_of_id: null,
    order_id: null,
    commerce_order_id: null,
    counterparty_name,
    created_by: auth.ctx.user_id,
    type: resolvedPaymentType,
  }

  const { data: ins, error: insErr } = await supabase.from('payments').insert(payPayload).select('id').maybeSingle()

  if (insErr) {
    await supabase
      .from('supplier_payables')
      .update({
        status: 'unpaid',
        paid_at: null,
        paid_by: null,
        note: prevNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pid)
      .eq('status', 'paid')

    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: pr.supplier_tenant_id,
      action_type: 'supplier_payable_paid_failed',
      reason: rsn,
      target_table: 'supplier_payables',
      target_id: pid,
      new_value: {
        supplier_payable_id: pid,
        commerce_order_id: pr.commerce_order_id,
        payable_amount: pr.payable_amount,
        error: insErr.message,
        code: (insErr as { code?: string }).code ?? null,
        admin_user_id: auth.ctx.user_id,
      },
    }).catch(() => {})

    return { success: false, error: insErr.message }
  }

  const payoutId = String((ins as { id: string } | null)?.id ?? '')
  if (!payoutId) {
    await supabase
      .from('supplier_payables')
      .update({
        status: 'unpaid',
        paid_at: null,
        paid_by: null,
        note: prevNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pid)
      .eq('status', 'paid')
    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: pr.supplier_tenant_id,
      action_type: 'supplier_payable_paid_failed',
      target_table: 'supplier_payables',
      target_id: pid,
      new_value: { supplier_payable_id: pid, error: 'payout insert returned no id', admin_user_id: auth.ctx.user_id },
    }).catch(() => {})
    return { success: false, error: '지급 이벤트 저장에 실패했습니다.' }
  }

  if (!rawOverride) {
    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: pr.supplier_tenant_id,
      action_type: 'payment_type_missing_rejected',
      reason: rsn,
      target_table: 'payments',
      target_id: payoutId,
      new_value: {
        supplier_payable_id: pid,
        payout_payment_id: payoutId,
        soft: true,
        insert_not_blocked: true,
        defaulted_to: resolvedPaymentType,
        admin_user_id: auth.ctx.user_id,
      },
    }).catch(() => {})
  }

  const logPaid = await insertAdminLog(supabase, {
    admin_id: auth.ctx.user_id,
    tenant_id: pr.supplier_tenant_id,
    action_type: 'supplier_payable_paid',
    reason: rsn,
    target_table: 'supplier_payables',
    target_id: pid,
    new_value: {
      supplier_payable_id: pid,
      payout_payment_id: payoutId,
      payable_amount: pr.payable_amount,
      commerce_order_id: pr.commerce_order_id,
      commerce_order_allocation_id: pr.commerce_order_allocation_id,
      payment_type: resolvedPaymentType,
      admin_user_id: auth.ctx.user_id,
    },
  })
  if (!logPaid.ok) {
    await insertAdminLog(supabase, {
      admin_id: auth.ctx.user_id,
      tenant_id: pr.supplier_tenant_id,
      action_type: 'supplier_payable_paid_failed',
      target_table: 'supplier_payables',
      target_id: pid,
      new_value: {
        supplier_payable_id: pid,
        payout_payment_id: payoutId,
        error: `admin_logs 실패: ${logPaid.error}`,
        admin_user_id: auth.ctx.user_id,
      },
    }).catch(() => {})
  }

  revalidatePath('/admin/commerce/payables')
  revalidatePath('/admin/commerce/allocations')
  revalidatePath('/admin/commerce/orders')

  return { success: true, data: { payout_payment_id: payoutId } }
}
