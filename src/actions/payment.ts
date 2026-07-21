'use server'

import { revalidatePath } from 'next/cache'
import { linkActionResult } from '@/actions/action-log'
import { createSupabaseServer, getAuthCtx, type AuthCtx } from '@/lib/supabase-server'
import {
  fetchInboundSupersededOriginalPaymentIds,
  PAYMENTS_TYPE_PAYOUT_OUTBOUND,
  PAYMENTS_TYPE_PAYOUT_REVERSAL,
} from '@/lib/inbound-payment-superseded'
import type { ActionResult } from '@/types/order'
import { effectiveOrderAmount, getAccountsReceivable, getCustomerDeposit } from '@/lib/ledger-calc'

export type PaymentMethod = 'transfer' | 'cash' | 'card' | 'platform'

export interface CreatePaymentInput {
  customer_id:              string
  amount:                   number
  payment_date:             string
  payment_method:           PaymentMethod
  memo?:                    string
  collection_schedule_id?:  string | null
  order_id?:                string | null   // 주문과 함께 처리 시 연결
}

export interface CreatePaymentResult {
  id:             string
  applied_amount: number
  deposit_amount: number
  balance_before: number
  mode:           'rpc'
  warning?:       string
}

// ============================================================
// 수금 등록
// 우선순위: create_payment_atomic RPC
// ============================================================

export async function createPayment(
  input: CreatePaymentInput,
): Promise<ActionResult<CreatePaymentResult>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  if (!input.customer_id)
    return { success: false, error: '거래처를 선택해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount))
    return { success: false, error: '유효한 금액을 입력해주세요. (양의 정수)' }

  // 중복 수금 감지 (2분 내 동일 customer + 동일 amount)
  let dupWarning: string | undefined
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recentPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('customer_id', input.customer_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('direction', 'inbound')
    .eq('amount', input.amount)
    .eq('status', 'confirmed')
    .gte('created_at', twoMinsAgo)
    .limit(1)
    .maybeSingle()
  if (recentPayment) {
    dupWarning = `최근 동일 금액(${input.amount.toLocaleString()}원)의 수금이 등록되어 있습니다. 중복인지 확인하세요.`
  }

  // ── 1차 시도: RPC (balance 계산 + deposit 분리 + insert 단일 트랜잭션) ──
  const { data: rpcData, error: rpcErr } = await supabase.rpc('create_payment_atomic', {
    p_tenant_id:               ctx.tenant_id,
    p_customer_id:             input.customer_id,
    p_amount:                  input.amount,
    p_payment_date:            input.payment_date,
    p_payment_method:          input.payment_method,
    p_memo:                    input.memo ?? null,
    p_created_by:              ctx.user_id,
    p_collection_schedule_id:  input.collection_schedule_id ?? null,
    p_order_id:                input.order_id ?? null,
  })

  if (rpcErr) {
    return { success: false, error: rpcErr.message }
  }
  if (rpcData == null) {
    return { success: false, error: '수금 저장 실패: RPC 응답이 비어있습니다.' }
  }

  // 2026-07-21 정책: 예치금 미운영.
  // create_payment_atomic이 반환하는 deposit_amount는 무시한다.
  // 초과입금은 payments 전액만 기록 → getAccountsReceivable에 자연 반영.
  const deposit_amount = (rpcData.deposit_amount as number | null) ?? 0

  // FIFO 자동 배분 (best-effort): 배분 실패해도 수금 자체는 성공 유지
  try {
    await supabase.rpc('allocate_payment_fifo', {
      p_tenant_id:  ctx.tenant_id,
      p_payment_id: rpcData.id as string,
    })
  } catch { /* noop */ }

  await linkActionResult({
    customer_id:        input.customer_id,
    tenant_id:          ctx.tenant_id,
    result_type:        'payment_completed',
    result_amount:      input.amount,
    related_payment_id: rpcData.id as string,
  }).catch(() => {})  // action_log 실패는 수금 성공에 영향 없음

  revalidatePath('/customers')
  revalidatePath('/payments/new')

  return {
    success: true,
    data: {
      id:             rpcData.id             as string,
      applied_amount: rpcData.applied_amount as number,
      deposit_amount, // RPC 반환값 전달만 (예치금 적립 안 함)
      balance_before: rpcData.balance_before as number,
      mode:           'rpc',
      warning:        dupWarning || undefined,
    },
  }
}

// ============================================================
// Append-only reversal (RFQ outbound / inbound) — [D-021]~[D-024] P1
// ============================================================

async function logPaymentReversalAudit(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  ctx: AuthCtx,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('log_payment_reversal_audit', {
    p_action_type: actionType,
    p_tenant_id:   ctx.tenant_id,
    p_new_value:   payload,
  })
  if (error && process.env.NODE_ENV === 'development') {
    console.warn('[log_payment_reversal_audit]', error.message)
  }
}

function tenantInboundPayeeScope(tenantId: string): string {
  return `payee_tenant_id.eq.${tenantId},tenant_id.eq.${tenantId}`
}

function tenantOutboundPayerScope(tenantId: string): string {
  return `payer_tenant_id.eq.${tenantId},tenant_id.eq.${tenantId}`
}

/** RFQ outbound allocation이 “유효”한지(레거시 reversed + append-only 상쇅 row). */
async function computeOutboundEffectivePaidForPurchase(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  ctx: AuthCtx,
  purchaseId: string,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('payment_allocations')
    .select(`
      allocated_amount,
      payment_id,
      payments!inner(id, status, direction)
    `)
    .eq('purchase_id', purchaseId)
    .eq('tenant_id', ctx.tenant_id)

  if (error || !rows?.length) return 0

  type Pay = { id: string; status: string; direction: string }
  const paymentIds = [
    ...new Set(
      (rows as { payment_id: string; payments: Pay | Pay[] }[]).map((r) => {
        const p = Array.isArray(r.payments) ? r.payments[0] : r.payments
        return String(p?.id ?? '')
      }).filter(Boolean),
    ),
  ]
  if (!paymentIds.length) return 0

  const { data: revRows } = await supabase
    .from('payments')
    .select('reversal_of_id')
    .in('reversal_of_id', paymentIds)
    .eq('direction', 'outbound')
    .eq('status', 'reversed')

  const superseded = new Set(
    (revRows ?? []).map((x: { reversal_of_id: string }) => String(x.reversal_of_id)),
  )

  let sum = 0
  for (const row of rows as { allocated_amount: number; payments: Pay | Pay[] }[]) {
    const p = Array.isArray(row.payments) ? row.payments[0] : row.payments
    if (!p || p.direction !== 'outbound') continue
    if (!(p.status === 'pending' || p.status === 'confirmed')) continue
    if (superseded.has(p.id)) continue
    sum += Number(row.allocated_amount ?? 0)
  }
  return sum
}

async function recalculatePurchasesAfterOutboundAppendOnly(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  ctx: AuthCtx,
  originalPaymentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: allocRows, error: aErr } = await supabase
    .from('payment_allocations')
    .select('purchase_id')
    .eq('payment_id', originalPaymentId)
    .eq('tenant_id', ctx.tenant_id)
    .not('purchase_id', 'is', null)

  if (aErr) return { ok: false, error: aErr.message }

  const purchaseIds = [
    ...new Set(
      (allocRows ?? []).map((r: { purchase_id: string }) => String(r.purchase_id)).filter(Boolean),
    ),
  ]

  for (const v_pid of purchaseIds) {
    const v_effective_paid = await computeOutboundEffectivePaidForPurchase(supabase, ctx, v_pid)

    const { data: pur, error: pErr } = await supabase
      .from('purchases')
      .select('total_amount')
      .eq('id', v_pid)
      .eq('tenant_id', ctx.tenant_id)
      .maybeSingle()

    if (pErr || !pur) return { ok: false, error: pErr?.message ?? 'purchase not found' }

    const v_total_amount = Number((pur as { total_amount: number }).total_amount ?? 0)
    const v_new_status =
      v_effective_paid >= v_total_amount ? 'paid'
        : v_effective_paid > 0 ? 'partial'
          : 'unpaid'

    const { error: uErr } = await supabase
      .from('purchases')
      .update({ status: v_new_status, updated_at: new Date().toISOString() })
      .eq('id', v_pid)
      .eq('tenant_id', ctx.tenant_id)

    if (uErr) return { ok: false, error: uErr.message }
  }

  return { ok: true }
}

/** `insertOutboundReversal` 차단 시 메시지 — `cancelDisbursement`가 legacy RPC로 우회하지 않도록 동일 값으로 비교 */
const PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR =
  'payout_outbound는 자동 reversal 불가. 수동 처리 필요.' as const

function pickReversalPaymentType(origType: unknown): { type: string; warned: boolean } {
  if (origType != null && String(origType).trim() !== '') {
    return { type: String(origType), warned: false }
  }
  return { type: PAYMENTS_TYPE_PAYOUT_REVERSAL, warned: true }
}
/**
 * RFQ outbound 지급 append-only 상쇅 row ([D-024]). 원본 `payments` UPDATE 금지.
 */
export async function insertOutboundReversal(
  payment_id: string,
  reason: string,
): Promise<ActionResult<{ reversal_payment_id: string | null; skipped?: boolean }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const rsn = String(reason ?? '').trim().slice(0, 500) || 'disbursement_cancelled'

  const { data: orig, error: oErr } = await supabase
    .from('payments')
    .select('*')
    .eq('id', payment_id)
    .eq('direction', 'outbound')
    .or(tenantOutboundPayerScope(ctx.tenant_id))
    .in('status', ['pending', 'confirmed'])
    .is('reversal_of_id', null)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!orig) return { success: false, error: '지급 내역을 찾을 수 없거나 취소할 수 없습니다.' }

  const origId = String((orig as { id: string }).id)

  if (String((orig as Record<string, unknown>).type ?? '').trim() === PAYMENTS_TYPE_PAYOUT_OUTBOUND) {
    await logPaymentReversalAudit(supabase, ctx, 'payout_reversal_blocked', {
      payment_id: origId,
      reason: rsn,
      payment_type: PAYMENTS_TYPE_PAYOUT_OUTBOUND,
      admin_user_id: ctx.user_id,
    })
    return {
      success: false,
      error: PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR,
    }
  }

  const { data: dup } = await supabase
    .from('payments')
    .select('id')
    .eq('reversal_of_id', origId)
    .maybeSingle()

  if (dup?.id) {
    await logPaymentReversalAudit(supabase, ctx, 'outbound_payment_reversal_created', {
      payment_id: origId,
      reversal_payment_id: String((dup as { id: string }).id),
      skipped:    true,
      reason:     rsn,
      admin_user_id: ctx.user_id,
    })
    return { success: true, data: { reversal_payment_id: String((dup as { id: string }).id), skipped: true } }
  }

  const o   = orig as Record<string, unknown>
  const tIn = pickReversalPaymentType(o.type)
  if (tIn.warned) {
    await logPaymentReversalAudit(supabase, ctx, 'payment_type_missing_warned', {
      payment_id: origId,
      direction:  'outbound',
      defaulted_type: PAYMENTS_TYPE_PAYOUT_REVERSAL,
      admin_user_id: ctx.user_id,
    })
  }

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    tenant_id:          o.tenant_id ?? ctx.tenant_id,
    payer_tenant_id:    o.payer_tenant_id ?? ctx.tenant_id,
    payee_tenant_id:    o.payee_tenant_id ?? null,
    counterparty_name:  o.counterparty_name ?? null,
    amount:             o.amount,
    payment_date:       o.payment_date ?? new Date().toISOString().slice(0, 10),
    due_date:           o.due_date ?? null,
    payment_method:     o.payment_method,
    memo:               typeof o.memo === 'string' ? `${o.memo} [reversal]` : '[reversal]',
    status:             'reversed',
    direction:          'outbound',
    deposit_amount:     o.deposit_amount ?? 0,
    order_id:           o.order_id ?? null,
    commerce_order_id:  o.commerce_order_id ?? null,
    created_by:         ctx.user_id,
    reversal_of_id:     origId,
    reversal_reason:    rsn,
    reversed_by:        ctx.user_id,
    reversed_at:        now,
    type:               tIn.type,
  }

  const { data: ins, error: insErr } = await supabase.from('payments').insert(payload).select('id').maybeSingle()

  if (insErr) {
    const code = (insErr as { code?: string }).code
    await logPaymentReversalAudit(supabase, ctx, 'outbound_payment_reversal_failed', {
      payment_id: origId,
      error:      insErr.message,
      code:       code ?? null,
      admin_user_id: ctx.user_id,
    })
    if (code === '23505') {
      return { success: true, data: { reversal_payment_id: null, skipped: true } }
    }
    return { success: false, error: insErr.message }
  }

  const newId = (ins as { id?: string } | null)?.id ?? null
  const rec = await recalculatePurchasesAfterOutboundAppendOnly(supabase, ctx, origId)
  if (!rec.ok) {
    await logPaymentReversalAudit(supabase, ctx, 'outbound_payment_reversal_failed', {
      payment_id: origId,
      reversal_payment_id: newId,
      error:      `purchase_recalc_failed: ${rec.error}`,
      admin_user_id: ctx.user_id,
    })
    return { success: false, error: `지급 취소 처리 중 매입 상태 갱신 실패: ${rec.error}` }
  }

  await logPaymentReversalAudit(supabase, ctx, 'outbound_payment_reversal_created', {
    payment_id: origId,
    reversal_payment_id: newId,
    amount:     o.amount,
    order_id:   o.order_id ?? null,
    reason:     rsn,
    admin_user_id: ctx.user_id,
  })

  revalidatePath('/disbursements')
  revalidatePath('/purchases')
  return { success: true, data: { reversal_payment_id: newId } }
}

/**
 * RFQ inbound 수금 append-only 상쇅 row ([D-024]). 원본 `payments` UPDATE 금지.
 */
export async function insertInboundPaymentReversal(
  payment_id: string,
  reason: string,
): Promise<ActionResult<{ reversal_payment_id: string | null; skipped?: boolean }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const rsn = String(reason ?? '').trim().slice(0, 500) || 'payment_cancelled'

  const { data: orig, error: oErr } = await supabase
    .from('payments')
    .select('*')
    .eq('id', payment_id)
    .eq('direction', 'inbound')
    .or(tenantInboundPayeeScope(ctx.tenant_id))
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!orig) return { success: false, error: '수금 내역을 찾을 수 없거나 취소할 수 없습니다.' }

  const origId = String((orig as { id: string }).id)

  const { data: dup } = await supabase
    .from('payments')
    .select('id')
    .eq('reversal_of_id', origId)
    .maybeSingle()

  if (dup?.id) {
    await logPaymentReversalAudit(supabase, ctx, 'inbound_payment_reversal_created', {
      payment_id: origId,
      reversal_payment_id: String((dup as { id: string }).id),
      skipped:    true,
      reason:     rsn,
      admin_user_id: ctx.user_id,
    })
    return { success: true, data: { reversal_payment_id: String((dup as { id: string }).id), skipped: true } }
  }

  const o   = orig as Record<string, unknown>
  const tIn = pickReversalPaymentType(o.type)
  if (tIn.warned) {
    await logPaymentReversalAudit(supabase, ctx, 'payment_type_missing_warned', {
      payment_id: origId,
      direction:  'inbound',
      defaulted_type: PAYMENTS_TYPE_PAYOUT_REVERSAL,
      admin_user_id: ctx.user_id,
    })
  }

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    tenant_id:         o.tenant_id ?? ctx.tenant_id,
    payer_tenant_id:   o.payer_tenant_id ?? null,
    payee_tenant_id:   o.payee_tenant_id ?? ctx.tenant_id,
    customer_id:       o.customer_id ?? null,
    amount:            o.amount,
    payment_date:      o.payment_date ?? new Date().toISOString().slice(0, 10),
    due_date:          o.due_date ?? null,
    payment_method:    o.payment_method,
    memo:              typeof o.memo === 'string' ? `${o.memo} [reversal]` : '[reversal]',
    status:            'reversed',
    direction:         'inbound',
    deposit_amount:    o.deposit_amount ?? 0,
    order_id:          o.order_id ?? null,
    commerce_order_id: o.commerce_order_id ?? null,
    counterparty_name: o.counterparty_name ?? null,
    created_by:        ctx.user_id,
    reversal_of_id:    origId,
    reversal_reason:   rsn,
    reversed_by:       ctx.user_id,
    reversed_at:       now,
    type:              tIn.type,
  }

  const { data: ins, error: insErr } = await supabase.from('payments').insert(payload).select('id').maybeSingle()

  if (insErr) {
    const code = (insErr as { code?: string }).code
    await logPaymentReversalAudit(supabase, ctx, 'inbound_payment_reversal_failed', {
      payment_id: origId,
      error:      insErr.message,
      code:       code ?? null,
      admin_user_id: ctx.user_id,
    })
    if (code === '23505') {
      return { success: true, data: { reversal_payment_id: null, skipped: true } }
    }
    return { success: false, error: insErr.message }
  }

  const newId = (ins as { id?: string } | null)?.id ?? null
  await logPaymentReversalAudit(supabase, ctx, 'inbound_payment_reversal_created', {
    payment_id: origId,
    reversal_payment_id: newId,
    amount:     o.amount,
    order_id:   o.order_id ?? null,
    customer_id: o.customer_id ?? null,
    reason:     rsn,
    admin_user_id: ctx.user_id,
  })

  revalidatePath('/customers')
  revalidatePath('/payments/new')
  return { success: true, data: { reversal_payment_id: newId } }
}

// ============================================================
// 수금 취소 — append-only 상쇅 row 우선 ([D-024])
// D-024 transition debt fallback; remove after P1 verification — 레거시 UPDATE `reversed`
// ledger가 confirmed만 집계하므로 취소 시 자동으로 잔액 원복
// ============================================================

export async function cancelPayment(payment_id: string, reason?: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('id', payment_id)
    .eq('direction', 'inbound')
    .or(tenantInboundPayeeScope(ctx.tenant_id))
    .maybeSingle()

  if (!payment) return { success: false, error: '수금 내역을 찾을 수 없습니다.' }
  if (payment.status === 'reversed') return { success: false, error: '이미 취소된 수금입니다.' }

  const { data: child } = await supabase
    .from('payments')
    .select('id')
    .eq('reversal_of_id', payment_id)
    .maybeSingle()
  if (child?.id) return { success: false, error: '이미 취소된 수금입니다.' }

  const append = await insertInboundPaymentReversal(payment_id, reason ?? 'payment_cancelled')
  if (append.success) return { success: true }

  // D-024 transition debt fallback; remove after P1 verification — append-only INSERT 실패 시에만 레거시 UPDATE
  const { error } = await supabase
    .from('payments')
    .update({ status: 'reversed' })
    .eq('id', payment_id)
    .or(tenantInboundPayeeScope(ctx.tenant_id))

  if (error) return { success: false, error: error.message }

  await logPaymentReversalAudit(supabase, ctx, 'inbound_payment_reversal_legacy_fallback_used', {
    payment_id,
    legacy_update_used: true,
    append_error: append.error ?? null,
    admin_user_id: ctx.user_id,
  })

  revalidatePath('/customers')
  revalidatePath('/payments/new')
  return { success: true }
}

// ============================================================
// 잔액 + 예치금 조회 (UI 표시용)
// 미수: getAccountsReceivable / 예치: customer_deposits.balance
// ============================================================

export async function getCustomerBalance(
  customer_id: string,
): Promise<ActionResult<{ balance: number; deposit: number; customer_name: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, opening_balance')
    .eq('id', customer_id)
    .eq('tenant_id', ctx.tenant_id)
    .is('deleted_at', null)
    .single()
  if (!customer) return { success: false, error: '거래처 없음' }

  const scope = tenantInboundPayeeScope(ctx.tenant_id)
  const superseded = await fetchInboundSupersededOriginalPaymentIds(supabase, scope)

  let payQ = supabase.from('payments')
    .select('amount')
    .eq('customer_id', customer_id)
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(scope)
    .eq('direction', 'inbound')
    .eq('status', 'confirmed')
    .is('reversal_of_id', null)

  if (superseded.length) payQ = payQ.not('id', 'in', `(${superseded.join(',')})`)

  const [{ data: orderRows }, { data: paymentRows }, { data: depRow }] = await Promise.all([
    supabase.from('orders')
      .select('final_amount, total_amount, discount_amount, point_used, deposit_used')
      .eq('customer_id', customer_id)
      // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
      .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
      .eq('status', 'confirmed').is('deleted_at', null),
    payQ,
    supabase.from('customer_deposits')
      .select('balance')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', customer_id)
      .maybeSingle(),
  ])

  const totalOrders   = (orderRows   ?? []).reduce((s, o) => s + effectiveOrderAmount(o as { final_amount?: number | null; total_amount: number; discount_amount?: number | null; point_used?: number | null; deposit_used?: number | null }), 0)
  const totalPayments = (paymentRows ?? []).reduce((s, p) => s + p.amount, 0)
  const balance       = getAccountsReceivable(customer.opening_balance ?? 0, totalOrders, totalPayments, 0)
  const deposit       = getCustomerDeposit((depRow as { balance?: number | null } | null)?.balance)

  return { success: true, data: { balance, deposit, customer_name: customer.name } }
}

// ============================================================
// 수금 상세 + 배분 (SUP-MISSING-006)
// ============================================================

export interface PaymentDetail {
  id: string
  payment_date: string
  customer_id: string
  customer_name: string
  amount: number
  deposit_amount: number
  payment_method: string
  memo: string | null
  status: string
  created_at: string
}

export async function getPaymentDetail(payment_id: string): Promise<ActionResult<PaymentDetail>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_date, customer_id, amount, deposit_amount, payment_method, memo, status, created_at, customers(name)')
    .eq('id', payment_id)
    .eq('direction', 'inbound')
    .or(`payee_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: '수금 내역을 찾을 수 없습니다.' }

  return {
    success: true,
    data: {
      id: data.id,
      payment_date: data.payment_date,
      customer_id: data.customer_id,
      customer_name: (data.customers as any)?.name ?? '-',
      amount: data.amount,
      deposit_amount: data.deposit_amount ?? 0,
      payment_method: data.payment_method,
      memo: data.memo,
      status: data.status,
      created_at: data.created_at,
    },
  }
}

// ============================================================
// 수금 수정 (날짜/금액/방식/메모 + 수정사유)
// - 예치금(deposit_amount > 0)인 경우 금액 변경 불가
// - 금액은 활성 배분 합계 이상이어야 함
// ============================================================

export interface UpdatePaymentInput {
  payment_id: string
  payment_date: string
  amount: number
  payment_method: PaymentMethod
  memo?: string | null
  /** 수정 사유 (필수) */
  edit_reason: string
}

export async function updatePayment(
  input: UpdatePaymentInput,
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인이 필요합니다.' }

  const editReason = (input.edit_reason ?? '').trim()
  if (!editReason) return { success: false, error: '수정 사유를 입력해주세요.' }
  if (!input.payment_date) return { success: false, error: '수금일자를 입력해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount)) {
    return { success: false, error: '유효한 금액을 입력해주세요. (양의 정수)' }
  }
  const METHODS: PaymentMethod[] = ['transfer', 'cash', 'card', 'platform']
  if (!METHODS.includes(input.payment_method)) {
    return { success: false, error: '수금 방법이 올바르지 않습니다.' }
  }

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select('id, customer_id, amount, deposit_amount, payment_date, payment_method, memo, status')
    .eq('id', input.payment_id)
    .eq('direction', 'inbound')
    .or(tenantInboundPayeeScope(ctx.tenant_id))
    .maybeSingle()

  if (payErr) return { success: false, error: payErr.message }
  if (!payment) return { success: false, error: '수금 내역을 찾을 수 없습니다.' }
  if (payment.status === 'reversed') return { success: false, error: '취소된 수금은 수정할 수 없습니다.' }
  if (payment.status !== 'confirmed') {
    return { success: false, error: '확정된 수금만 수정할 수 있습니다.' }
  }

  const { data: child } = await supabase
    .from('payments')
    .select('id')
    .eq('reversal_of_id', input.payment_id)
    .maybeSingle()
  if (child?.id) return { success: false, error: '취소된 수금은 수정할 수 없습니다.' }

  const amountChanged = payment.amount !== input.amount
  const depositAmount = payment.deposit_amount ?? 0
  if (amountChanged && depositAmount > 0) {
    return {
      success: false,
      error: '예치금이 포함된 수금은 금액을 변경할 수 없습니다. 날짜·방식·메모만 수정하거나, 취소 후 재등록하세요.',
    }
  }

  if (amountChanged) {
    const { data: allocRows, error: allocErr } = await supabase
      .from('collection_allocations')
      .select('allocated_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('payment_id', input.payment_id)
      .eq('status', 'active')

    if (allocErr) return { success: false, error: allocErr.message }
    const allocatedSum = (allocRows ?? []).reduce(
      (s, r) => s + (r.allocated_amount ?? 0),
      0,
    )
    if (input.amount < allocatedSum) {
      return {
        success: false,
        error: `금액(${input.amount.toLocaleString()}원)이 배분 합계(${allocatedSum.toLocaleString()}원)보다 작을 수 없습니다.`,
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const prevMemo = (payment.memo ?? '').trim()
  const nextMemoBase = (input.memo ?? '').trim()
  const auditLine = `[수정 ${today}] ${editReason}`
  const mergedMemo = [nextMemoBase, auditLine].filter(Boolean).join('\n')

  const { error: updErr } = await supabase
    .from('payments')
    .update({
      payment_date: input.payment_date,
      amount: input.amount,
      payment_method: input.payment_method,
      memo: mergedMemo || null,
    })
    .eq('id', input.payment_id)
    .or(tenantInboundPayeeScope(ctx.tenant_id))

  if (updErr) return { success: false, error: updErr.message }

  await logPaymentReversalAudit(supabase, ctx, 'inbound_payment_updated', {
    payment_id: input.payment_id,
    customer_id: payment.customer_id,
    before: {
      payment_date: payment.payment_date,
      amount: payment.amount,
      payment_method: payment.payment_method,
      memo: payment.memo,
      deposit_amount: depositAmount,
    },
    after: {
      payment_date: input.payment_date,
      amount: input.amount,
      payment_method: input.payment_method,
      memo: mergedMemo || null,
    },
    edit_reason: editReason,
    admin_user_id: ctx.user_id,
    prev_memo_snapshot: prevMemo || null,
  }).catch(() => {})

  revalidatePath('/payments')
  revalidatePath(`/payments/${input.payment_id}`)
  revalidatePath('/customers')
  revalidatePath(`/customers/${payment.customer_id}`)
  revalidatePath(`/customers/${payment.customer_id}/ledger`)

  return { success: true }
}

export interface PaymentAllocationRow {
  id: string
  order_id: string
  order_date: string
  order_amount: number
  allocated_amount: number
  status: 'active' | 'voided'
  created_at: string
  voided_at: string | null
  voided_reason: string | null
}

export async function getPaymentAllocations(
  payment_id: string,
): Promise<ActionResult<PaymentAllocationRow[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  // payment scope check (존재/tenant 보호)
  const payment = await getPaymentDetail(payment_id)
  if (!payment.success || !payment.data) return payment as any

  const { data, error } = await supabase
    .from('collection_allocations')
    .select(`
      id,
      order_id,
      allocated_amount,
      status,
      created_at,
      voided_at,
      voided_reason,
      orders!inner(order_date, total_amount, final_amount)
    `)
    .eq('tenant_id', ctx.tenant_id)
    .eq('payment_id', payment_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      order_date: (r.orders as any)?.order_date ?? '-',
      order_amount: effectiveOrderAmount(r.orders as any),
      allocated_amount: r.allocated_amount,
      status: (r.status ?? 'active') as 'active' | 'voided',
      created_at: r.created_at,
      voided_at: r.voided_at ?? null,
      voided_reason: r.voided_reason ?? null,
    })),
  }
}

export interface OpenOrderForAllocation {
  order_id: string
  order_date: string
  order_amount: number
  already_allocated: number
  remaining: number
}

export async function getCustomerOpenOrdersForAllocation(
  customer_id: string,
): Promise<ActionResult<OpenOrderForAllocation[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, order_date, total_amount, final_amount')
    .eq('customer_id', customer_id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .order('order_date', { ascending: true })
    .limit(500)

  if (oErr) return { success: false, error: oErr.message }

  const orderRows = (orders ?? []).map((o: any) => ({
    order_id: o.id as string,
    order_date: o.order_date as string,
    order_amount: effectiveOrderAmount(o),
  }))

  const ids = orderRows.map((o) => o.order_id)
  const allocByOrder = new Map<string, number>()

  if (ids.length > 0) {
    const { data: allocs, error: aErr } = await supabase
      .from('collection_allocations')
      .select('order_id, allocated_amount, status')
      .eq('tenant_id', ctx.tenant_id)
      .in('order_id', ids)
      .eq('status', 'active')

    if (aErr) return { success: false, error: aErr.message }

    for (const a of allocs ?? []) {
      allocByOrder.set(a.order_id, (allocByOrder.get(a.order_id) ?? 0) + a.allocated_amount)
    }
  }

  const out: OpenOrderForAllocation[] = []
  for (const o of orderRows) {
    const already_allocated = allocByOrder.get(o.order_id) ?? 0
    const remaining = o.order_amount - already_allocated
    if (remaining > 0) {
      out.push({ ...o, already_allocated, remaining })
    }
  }

  return { success: true, data: out }
}

export async function allocatePaymentFifo(payment_id: string): Promise<ActionResult<{ status: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase.rpc('allocate_payment_fifo', {
    p_tenant_id: ctx.tenant_id,
    p_payment_id: payment_id,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath(`/payments/${payment_id}`)
  revalidatePath('/payments')
  return { success: true, data: { status: (data as any)?.status ?? 'ok' } }
}

export async function addPaymentAllocation(input: {
  payment_id: string
  order_id: string
  allocated_amount: number
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.allocated_amount || input.allocated_amount <= 0 || !Number.isInteger(input.allocated_amount)) {
    return { success: false, error: '배분 금액은 양의 정수여야 합니다.' }
  }

  // payment scope + customer_id 확보
  const payRes = await getPaymentDetail(input.payment_id)
  if (!payRes.success || !payRes.data) return payRes as any
  if (payRes.data.status !== 'confirmed') {
    return { success: false, error: '정상(confirmed) 수금만 배분할 수 있습니다.' }
  }

  // order scope + 동일 customer 검증
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id, customer_id, final_amount, total_amount, status, deleted_at')
    .eq('id', input.order_id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .maybeSingle()

  if (oErr) return { success: false, error: oErr.message }
  if (!order || order.deleted_at) return { success: false, error: '주문을 찾을 수 없습니다.' }
  if (order.status !== 'confirmed') return { success: false, error: '확정(confirmed) 주문만 배분할 수 있습니다.' }
  if (order.customer_id !== payRes.data.customer_id) {
    return { success: false, error: '수금 거래처와 주문 거래처가 일치하지 않습니다.' }
  }

  // 남은 배분 가능 금액 검증 (현재 payment 기준)
  const [{ data: allocSum }, { data: orderAllocSum }] = await Promise.all([
    supabase
      .from('collection_allocations')
      .select('allocated_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('payment_id', input.payment_id)
      .eq('status', 'active'),
    supabase
      .from('collection_allocations')
      .select('allocated_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('order_id', input.order_id)
      .eq('status', 'active'),
  ])

  const paymentAllocated = (allocSum ?? []).reduce((s: number, r: any) => s + r.allocated_amount, 0)
  const paymentRemaining = payRes.data.amount - paymentAllocated
  if (paymentRemaining <= 0) return { success: false, error: '이미 전액 배분되었습니다.' }
  if (input.allocated_amount > paymentRemaining) return { success: false, error: '배분 금액이 미배분 금액을 초과합니다.' }

  const orderAllocated = (orderAllocSum ?? []).reduce((s: number, r: any) => s + r.allocated_amount, 0)
  const orderAmount = effectiveOrderAmount(order as any)
  const orderRemaining = orderAmount - orderAllocated
  if (orderRemaining <= 0) return { success: false, error: '해당 주문은 이미 전액 수금 처리되었습니다.' }
  if (input.allocated_amount > orderRemaining) return { success: false, error: '배분 금액이 주문 미수금을 초과합니다.' }

  // 기존 allocation 존재 시 update(+=), 없으면 insert. (1 write)
  const { data: existing } = await supabase
    .from('collection_allocations')
    .select('id, allocated_amount, status')
    .eq('tenant_id', ctx.tenant_id)
    .eq('payment_id', input.payment_id)
    .eq('order_id', input.order_id)
    .maybeSingle()

  if (!existing) {
    const { error: insErr } = await supabase
      .from('collection_allocations')
      .insert({
        tenant_id: ctx.tenant_id,
        payment_id: input.payment_id,
        order_id: input.order_id,
        allocated_amount: input.allocated_amount,
        status: 'active',
      })
    if (insErr) return { success: false, error: insErr.message }
  } else {
    const nextAmount = (existing.allocated_amount ?? 0) + input.allocated_amount
    const { error: upErr } = await supabase
      .from('collection_allocations')
      .update({
        allocated_amount: nextAmount,
        status: 'active',
        voided_at: null,
        voided_reason: null,
      })
      .eq('id', existing.id)
      .eq('tenant_id', ctx.tenant_id)
    if (upErr) return { success: false, error: upErr.message }
  }

  revalidatePath(`/payments/${input.payment_id}`)
  revalidatePath('/payments')
  return { success: true }
}

export async function voidPaymentAllocation(input: {
  allocation_id: string
  reason?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const reason = (input.reason ?? 'manual_void').slice(0, 120)

  const { data: row, error: exErr } = await supabase
    .from('collection_allocations')
    .select('id, payment_id, status')
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', input.allocation_id)
    .maybeSingle()

  if (exErr) return { success: false, error: exErr.message }
  if (!row) return { success: false, error: '배분 내역을 찾을 수 없습니다.' }
  if (row.status === 'voided') return { success: true }

  const { error: upErr } = await supabase
    .from('collection_allocations')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_reason: reason,
    })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', input.allocation_id)

  if (upErr) return { success: false, error: upErr.message }

  revalidatePath(`/payments/${row.payment_id}`)
  revalidatePath('/payments')
  return { success: true }
}

// ============================================================
// 수금 목록 조회
// ============================================================

export interface PaymentListItem {
  id:             string
  payment_date:   string
  customer_id:    string
  customer_name:  string
  amount:         number
  deposit_amount: number
  payment_method: string
  memo:           string | null
  status:         string
  created_at:     string
}

export async function getPaymentList(filters?: {
  from?:        string
  to?:          string
  customer_id?: string
  status?:      string
}): Promise<ActionResult<PaymentListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const scope = tenantInboundPayeeScope(ctx.tenant_id)
  const superseded = await fetchInboundSupersededOriginalPaymentIds(supabase, scope)

  let query = supabase
    .from('payments')
    .select('id, payment_date, customer_id, amount, deposit_amount, payment_method, memo, status, created_at, customers(id, name)')
    // 전환: payee_tenant_id 우선 (legacy tenant_id 병행)
    .or(scope)
    .eq('direction', 'inbound')
    .is('reversal_of_id', null)
    .order('payment_date', { ascending: false })
    .order('created_at',   { ascending: false })
    .limit(500)

  if (superseded.length) query = query.not('id', 'in', `(${superseded.join(',')})`)

  if (filters?.from)        query = query.gte('payment_date', filters.from)
  if (filters?.to)          query = query.lte('payment_date', filters.to)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)
  if (filters?.status)      query = query.eq('status', filters.status)
  else                      query = query.in('status', ['confirmed', 'reversed'])

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((p: any) => ({
      id:             p.id,
      payment_date:   p.payment_date,
      customer_id:    p.customer_id,
      customer_name:  (p.customers as any)?.name ?? '-',
      amount:         p.amount,
      deposit_amount: p.deposit_amount ?? 0,
      payment_method: p.payment_method,
      memo:           p.memo,
      status:         p.status,
      created_at:     p.created_at,
    })),
  }
}

// ============================================================
// 지급 목록 조회 (outbound, RULE-01)
// ============================================================

export interface DisbursementListItem {
  id:                 string
  counterparty_name:  string | null
  amount:             number
  due_date:           string | null
  status:             string
  payment_method:     string
  /** `payments.type` — OPS-UX: `payout_outbound` 는 UI에서 지급 취소 버튼 숨김 */
  type:               string | null
  order_id:           string | null
  memo:               string | null
  created_at:         string
}

export async function getDisbursementList(filters?: {
  status?: string
}): Promise<ActionResult<DisbursementListItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  let query = supabase
    .from('payments')
    .select('id, counterparty_name, amount, due_date, status, payment_method, type, order_id, memo, created_at')
    .eq('direction', 'outbound')
    .or(`payer_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
    .is('reversal_of_id', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(50)

  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((p) => ({
      id:                p.id,
      counterparty_name: p.counterparty_name,
      amount:            p.amount,
      due_date:          p.due_date,
      status:            p.status,
      payment_method:    p.payment_method,
      type:              (p as { type?: string | null }).type ?? null,
      order_id:          p.order_id,
      memo:              p.memo,
      created_at:        p.created_at,
    })),
  }
}

// ============================================================
// 지급 등록 + 분배 (outbound, RULE-19 → RPC 단일 트랜잭션)
// ============================================================

export interface DisbursementAllocationInput {
  purchase_id?:      string | null
  allocated_amount:  number
}

export interface CreateDisbursementInput {
  counterparty_name: string
  amount:            number
  payment_date:      string
  payment_method:    PaymentMethod
  due_date:          string | null
  memo?:             string | null
  order_id?:         string | null
  allocations:       DisbursementAllocationInput[]
}

export async function createDisbursement(
  input: CreateDisbursementInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.counterparty_name?.trim())
    return { success: false, error: '매입처명을 입력해주세요.' }
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount))
    return { success: false, error: '지급 금액은 양의 정수여야 합니다.' }

  const allocations = (input.allocations ?? []).filter((a) => a.allocated_amount > 0)
  const sumAlloc = allocations.reduce((s, a) => s + a.allocated_amount, 0)
  if (sumAlloc > input.amount)
    return { success: false, error: '분배 합계가 지급 금액을 초과할 수 없습니다.' }

  const payload = allocations.map((a) => ({
    purchase_id:      a.purchase_id && a.purchase_id.length > 0 ? a.purchase_id : null,
    allocated_amount: a.allocated_amount,
  }))

  const { data: paymentId, error } = await supabase.rpc('create_disbursement_with_allocations', {
    p_tenant_id:         ctx.tenant_id,
    p_counterparty_name: input.counterparty_name.trim(),
    p_amount:            input.amount,
    p_payment_date:      input.payment_date,
    p_payment_method:    input.payment_method,
    p_due_date:          input.due_date,
    p_memo:              input.memo ?? null,
    p_order_id:          input.order_id ?? null,
    p_created_by:        ctx.user_id,
    p_allocations:       payload,
  })

  if (error) return { success: false, error: error.message }
  if (!paymentId) return { success: false, error: '지급 저장 실패: RPC 응답 없음' }

  revalidatePath('/disbursements')
  revalidatePath('/disbursements/new')

  return { success: true, data: { id: paymentId as string } }
}

// ============================================================
// 지급 취소 — append-only INSERT 우선 ([D-024]); `reverse_disbursement` RPC는 transition debt fallback
// ============================================================

export async function cancelDisbursement(payment_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx      = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const append = await insertOutboundReversal(payment_id, 'disbursement_cancelled')
  if (append.success) return { success: true }

  if (!append.success && append.error === PAYOUT_OUTBOUND_REVERSAL_BLOCKED_ERROR) {
    return { success: false, error: append.error }
  }

  // D-024 transition debt fallback; remove after P1 verification
  const { error } = await supabase.rpc('reverse_disbursement', {
    p_tenant_id:  ctx.tenant_id,
    p_payment_id: payment_id,
  })

  if (error) return { success: false, error: error.message }

  await logPaymentReversalAudit(supabase, ctx, 'outbound_payment_reversal_legacy_fallback_used', {
    payment_id,
    append_error: append.error ?? null,
    admin_user_id: ctx.user_id,
  })

  revalidatePath('/disbursements')
  revalidatePath('/purchases')

  return { success: true }
}