'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'
import { PAYMENTS_TYPE_PAYOUT_REVERSAL } from '@/lib/inbound-payment-superseded'

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

export type CreatePaymentReversalRowResult =
  | { success: true; reversal_payment_id: string | null; skipped: boolean }
  | { success: false; error: string }

type PayableRow = {
  id: string
  status: string
  payable_amount: number
  supplier_tenant_id: string
  commerce_order_id: string
  commerce_order_allocation_id: string
}

async function logPayableManualReview(
  supabase: any,
  adminId: string,
  pr: PayableRow,
  extra?: Record<string, unknown>,
): Promise<void> {
  await insertAdminLog(supabase, {
    admin_id: adminId,
    tenant_id: pr.supplier_tenant_id,
    action_type: 'commerce_payable_manual_review_required',
    target_table: 'supplier_payables',
    target_id: pr.id,
    new_value: {
      payable_id: pr.id,
      supplier_tenant_id: pr.supplier_tenant_id,
      amount: pr.payable_amount,
      status: pr.status,
      commerce_order_id: pr.commerce_order_id,
      ...extra,
    },
  }).catch(() => {})
}

/**
 * `unpaid` → `cancelled` + audit (금액 컬럼 변경 없음). paid·기타 상태는 로그만/거절.
 * 주문 취소 배치에서도 사용 — 실패해도 호출부가 주문을 되돌리지 않음.
 */
export async function cancelSupplierPayableWithClient(
  supabase: any,
  adminUserId: string,
  payableId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const pid = String(payableId ?? '').trim()
  const rsn = String(reason ?? '').trim().slice(0, 500)
  const aid = String(adminUserId ?? '').trim()
  if (!pid || !aid) return { success: false, error: 'payable ID·관리자 정보가 필요합니다' }

  const { data: row, error: gErr } = await supabase
    .from('supplier_payables')
    .select('id, status, payable_amount, supplier_tenant_id, commerce_order_id, commerce_order_allocation_id')
    .eq('id', pid)
    .maybeSingle()
  if (gErr) return { success: false, error: gErr.message }
  if (!row) return { success: false, error: 'payable을 찾을 수 없습니다' }

  const pr = row as PayableRow
  const st = String(pr.status ?? '')

  if (st === 'cancelled') return { success: true }

  if (st === 'paid') {
    await logPayableManualReview(supabase, aid, pr, {
      reason: 'paid payable — 자동 reversal·cancel 금지([D-021])',
    })
    return { success: false, error: '이미 지급 처리된 payable은 취소할 수 없습니다. 수동 검토가 필요합니다.' }
  }

  if (st !== 'unpaid') {
    await logPayableManualReview(supabase, aid, pr)
    return { success: false, error: 'unpaid 상태만 자동 취소할 수 있습니다' }
  }

  const now = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('supplier_payables')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: aid,
      reversed_at: now,
      reversed_by: aid,
      reversal_reason: rsn || 'manual_cancel',
      updated_at: now,
    })
    .eq('id', pid)
    .eq('status', 'unpaid')

  if (uErr) return { success: false, error: uErr.message }

  const logOk = await insertAdminLog(supabase, {
    admin_id: aid,
    tenant_id: pr.supplier_tenant_id,
    action_type: 'commerce_payable_cancelled',
    target_table: 'supplier_payables',
    target_id: pid,
    new_value: {
      commerce_order_id: pr.commerce_order_id,
      commerce_order_allocation_id: pr.commerce_order_allocation_id,
      payable_id: pr.id,
      payable_amount: pr.payable_amount,
      admin_user_id: aid,
      reversal_reason: rsn || 'manual_cancel',
    },
  })
  if (!logOk.ok) return { success: false, error: `admin_logs 기록 실패: ${logOk.error}` }

  revalidatePath('/admin/commerce/allocations')
  revalidatePath('/admin/commerce/payables')
  revalidatePath('/admin/commerce/orders')
  return { success: true }
}

export async function cancelSupplierPayable(payable_id: string, reason: string): Promise<ActionResult<void>> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  return cancelSupplierPayableWithClient(supabase, auth.ctx.user_id, payable_id, reason)
}

async function createPaymentReversalRowInternal(
  supabase: any,
  commerce_order_id: string,
  reason: string,
  admin_user_id: string,
): Promise<CreatePaymentReversalRowResult> {
  const oid = String(commerce_order_id ?? '').trim()
  const rid = String(reason ?? '').trim().slice(0, 500)
  const aid = String(admin_user_id ?? '').trim()
  if (!oid || !aid) return { success: false, error: '주문 ID·관리자 정보가 필요합니다' }

  const { data: orderRow, error: oErr } = await supabase
    .from('commerce_orders')
    .select('id, tenant_id')
    .eq('id', oid)
    .maybeSingle()
  if (oErr) return { success: false, error: oErr.message }
  const tenantId = (orderRow as { tenant_id?: string } | null)?.tenant_id ?? null

  const { data: orig, error: fErr } = await supabase
    .from('payments')
    .select('*')
    .eq('commerce_order_id', oid)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
    .maybeSingle()

  if (fErr) return { success: false, error: fErr.message }
  if (!orig || !(orig as { id?: string }).id) {
    return { success: true, reversal_payment_id: null, skipped: true }
  }

  const origId = String((orig as { id: string }).id)

  const { data: dup } = await supabase.from('payments').select('id').eq('reversal_of_id', origId).maybeSingle()
  if (dup?.id) {
    return { success: true, reversal_payment_id: String((dup as { id: string }).id), skipped: true }
  }

  const o = orig as Record<string, unknown>
  const now = new Date().toISOString()
  const origType = o.type
  const typeMissing = origType == null || String(origType).trim() === ''

  const payload: Record<string, unknown> = {
    tenant_id: o.tenant_id ?? PLATFORM_OWNER_TENANT,
    payer_tenant_id: o.payer_tenant_id ?? null,
    payee_tenant_id: o.payee_tenant_id ?? PLATFORM_OWNER_TENANT,
    direction: o.direction ?? 'inbound',
    status: 'reversed',
    amount: o.amount,
    commerce_order_id: oid,
    order_id: null,
    payment_method: o.payment_method,
    payment_date: o.payment_date ?? null,
    due_date: o.due_date ?? null,
    deposit_amount: o.deposit_amount ?? 0,
    counterparty_name: o.counterparty_name ?? null,
    memo: typeof o.memo === 'string' ? `${o.memo} [reversal]` : '[reversal]',
    customer_id: o.customer_id ?? null,
    created_by: aid,
    reversal_of_id: origId,
    reversal_reason: rid || 'commerce_order_cancelled',
    reversed_by: aid,
    reversed_at: now,
    type: typeMissing ? PAYMENTS_TYPE_PAYOUT_REVERSAL : origType,
  }
  if (typeMissing) {
    await insertAdminLog(supabase, {
      admin_id: aid,
      tenant_id: tenantId,
      action_type: 'payment_type_missing_warned',
      target_table: 'payments',
      target_id: origId,
      new_value: {
        commerce_order_id: oid,
        defaulted_type: PAYMENTS_TYPE_PAYOUT_REVERSAL,
        admin_user_id: aid,
      },
    }).catch(() => {})
  }
  if (o.settlement_memo != null) payload.settlement_memo = o.settlement_memo

  const { data: ins, error: insErr } = await supabase.from('payments').insert(payload).select('id').maybeSingle()

  if (insErr) {
    const code = (insErr as { code?: string }).code
    await insertAdminLog(supabase, {
      admin_id: aid,
      tenant_id: tenantId,
      action_type: 'commerce_payment_reversal_failed',
      target_table: 'payments',
      target_id: origId,
      new_value: {
        commerce_order_id: oid,
        error: insErr.message,
        code: code ?? null,
      },
    }).catch(() => {})
    if (code === '23505') return { success: true, reversal_payment_id: null, skipped: true }
    return { success: false, error: insErr.message }
  }

  const newId = (ins as { id?: string } | null)?.id ?? null
  const logOk = await insertAdminLog(supabase, {
    admin_id: aid,
    tenant_id: tenantId,
    action_type: 'commerce_payment_reversal_created',
    target_table: 'payments',
    target_id: newId,
    new_value: {
      commerce_order_id: oid,
      payment_id: origId,
      reversal_payment_id: newId,
      amount: o.amount,
      admin_user_id: aid,
      reversal_reason: payload.reversal_reason,
    },
  })
  if (!logOk.ok) {
    await insertAdminLog(supabase, {
      admin_id: aid,
      tenant_id: tenantId,
      action_type: 'commerce_payment_reversal_failed',
      target_table: 'payments',
      target_id: origId,
      new_value: {
        commerce_order_id: oid,
        payment_id: origId,
        error: `admin_logs 실패: ${logOk.error}`,
      },
    }).catch(() => {})
  }

  return { success: true, reversal_payment_id: newId, skipped: false }
}

/** 관리자 세션 + `admin_user_id` 일치 시 `payments` append-only reversal row 1건 생성 */
export async function createPaymentReversalRow(
  commerce_order_id: string,
  reason: string,
  admin_user_id: string,
): Promise<CreatePaymentReversalRowResult> {
  const supabase = await createSupabaseServer()
  const auth = await requireAdmin(supabase)
  if (!auth.ok) return { success: false, error: auth.error }
  if (String(admin_user_id ?? '').trim() !== auth.ctx.user_id) {
    return { success: false, error: '관리자 정보가 세션과 일치하지 않습니다' }
  }
  return createPaymentReversalRowInternal(supabase, commerce_order_id, reason, auth.ctx.user_id)
}

/** `updateCommerceOrderStatus` cancelled 후처리: reversal + payables (실패 시에도 주문은 유지) */
export async function processCommerceOrderCancelledAccountingP0(
  supabase: any,
  input: {
    commerce_order_id: string
    tenant_id: string | null
    admin_user_id: string
    record_payment_reversal: boolean
  },
): Promise<void> {
  const oid = String(input.commerce_order_id ?? '').trim()
  const aid = String(input.admin_user_id ?? '').trim()
  if (!oid || !aid) return

  if (input.record_payment_reversal) {
    const rev = await createPaymentReversalRowInternal(supabase, oid, 'commerce_order_cancelled', aid)
    if (!rev.success) {
      await insertAdminLog(supabase, {
        admin_id: aid,
        tenant_id: input.tenant_id,
        action_type: 'commerce_payment_reversal_failed',
        target_table: 'commerce_orders',
        target_id: oid,
        new_value: {
          commerce_order_id: oid,
          admin_user_id: aid,
          error: rev.error,
        },
      }).catch(() => {})
    }
  }

  const { data: payables, error: pErr } = await supabase
    .from('supplier_payables')
    .select('id, status, payable_amount, supplier_tenant_id, commerce_order_id, commerce_order_allocation_id')
    .eq('commerce_order_id', oid)

  if (pErr) {
    await insertAdminLog(supabase, {
      admin_id: aid,
      tenant_id: input.tenant_id,
      action_type: 'commerce_payable_manual_review_required',
      target_table: 'commerce_orders',
      target_id: oid,
      new_value: {
        commerce_order_id: oid,
        admin_user_id: aid,
        error: pErr.message,
        scope: 'supplier_payables_list',
      },
    }).catch(() => {})
    return
  }

  for (const p of payables ?? []) {
    const pr = p as PayableRow
    if (pr.status === 'unpaid') {
      const r = await cancelSupplierPayableWithClient(supabase, aid, pr.id, 'commerce_order_cancelled')
      if (!r.success) {
        await insertAdminLog(supabase, {
          admin_id: aid,
          tenant_id: pr.supplier_tenant_id ?? input.tenant_id,
          action_type: 'commerce_payable_manual_review_required',
          target_table: 'supplier_payables',
          target_id: pr.id,
          new_value: {
            commerce_order_id: oid,
            payable_id: pr.id,
            admin_user_id: aid,
            amount: pr.payable_amount,
            status: pr.status,
            error: r.error ?? 'cancel_failed',
          },
        }).catch(() => {})
      }
    } else if (pr.status === 'paid') {
      await logPayableManualReview(supabase, aid, pr)
    }
  }
}
