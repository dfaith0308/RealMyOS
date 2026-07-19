'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx, type AuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>

export async function getCustomerDeposit(
  customer_id: string,
): Promise<ActionResult<{ balance: number }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data: row, error } = await supabase
    .from('customer_deposits')
    .select('balance')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { balance: row?.balance ?? 0 } }
}

export interface DepositLogItem {
  id: string
  amount: number
  type: 'credit' | 'debit'
  reason: string | null
  payment_id: string | null
  order_id: string | null
  created_at: string
}

export async function getDepositLogs(
  customer_id: string,
): Promise<ActionResult<DepositLogItem[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('deposit_logs')
    .select('id, amount, type, reason, payment_id, order_id, created_at')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as DepositLogItem[] }
}

export async function useDeposit(
  customer_id: string,
  amount: number,
  payment_id?: string | null,
): Promise<ActionResult<{ balance_after: number }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return { success: false, error: '예치금 사용 금액은 양의 정수여야 합니다.' }
  }

  // scope: customer must belong to tenant
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', customer_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!customer) return { success: false, error: '거래처 없음' }

  const { data: dep, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, balance')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .maybeSingle()

  if (depErr) return { success: false, error: depErr.message }
  const before = dep?.balance ?? 0
  if (before < amount) {
    return { success: false, error: '예치금 잔액이 부족합니다.' }
  }

  const after = before - amount

  // 1) balance update/upsert
  if (!dep) {
    // 비정상 케이스: 잔액이 0이어야 하는데 before 계산상 amount를 뺄 수 없음 → 위에서 걸림
    return { success: false, error: '예치금 스냅샷이 없습니다.' }
  }

  const { error: upErr } = await supabase
    .from('customer_deposits')
    .update({ balance: after, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', dep.id)
    .gte('balance', amount)

  if (upErr) return { success: false, error: upErr.message }

  // 2) log insert (필수). 실패 시 롤백.
  const { error: logErr } = await supabase.from('deposit_logs').insert({
    tenant_id: ctx.tenant_id,
    customer_id,
    amount,
    type: 'debit',
    reason: 'use_deposit',
    payment_id: payment_id ?? null,
  })

  if (logErr) {
    await supabase
      .from('customer_deposits')
      .update({ balance: before, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenant_id)
      .eq('id', dep.id)
    return { success: false, error: `예치금 이력 기록 실패: ${logErr.message}` }
  }

  revalidatePath('/payments/new')
  revalidatePath('/customers')
  revalidatePath(`/customers/${customer_id}/ledger`)

  return { success: true, data: { balance_after: after } }
}

/**
 * confirmed 주문에 대해 예치금 자동 차감.
 * 차감액 = MIN(잔액, total - discount - point), orders.deposit_used 반영.
 * 이미 차감된 주문(deposit_used>0 또는 동일 order_id debit 로그)은 no-op.
 */
export async function applyOrderDepositAuto(opts: {
  supabase: SupabaseServer
  ctx: AuthCtx
  order_id: string
  customer_id: string
  total_amount: number
  discount_amount: number
  point_used: number
  /** insert 직후라 deposit_used가 아직 0인 경우 생략 가능 */
  current_deposit_used?: number
}): Promise<ActionResult<{ deposit_used: number; balance_after: number | null }>> {
  const {
    supabase,
    ctx,
    order_id,
    customer_id,
    total_amount,
    discount_amount,
    point_used,
  } = opts

  if ((opts.current_deposit_used ?? 0) > 0) {
    return {
      success: true,
      data: { deposit_used: opts.current_deposit_used!, balance_after: null },
    }
  }

  const { data: existingDebit } = await supabase
    .from('deposit_logs')
    .select('id, amount')
    .eq('tenant_id', ctx.tenant_id)
    .eq('order_id', order_id)
    .eq('type', 'debit')
    .eq('reason', 'order_auto_debit')
    .maybeSingle()

  if (existingDebit) {
    return {
      success: true,
      data: { deposit_used: existingDebit.amount, balance_after: null },
    }
  }

  const remaining = Math.max(
    0,
    Math.round(total_amount) - Math.max(0, Math.round(discount_amount)) - Math.max(0, Math.round(point_used)),
  )
  if (remaining <= 0) {
    return { success: true, data: { deposit_used: 0, balance_after: null } }
  }

  const { data: dep, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, balance')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .maybeSingle()

  if (depErr) return { success: false, error: depErr.message }

  const before = dep?.balance ?? 0
  const amount = Math.min(before, remaining)
  if (amount <= 0 || !dep) {
    return { success: true, data: { deposit_used: 0, balance_after: before } }
  }

  const after = before - amount

  const { data: updated, error: upErr } = await supabase
    .from('customer_deposits')
    .update({ balance: after, updated_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenant_id)
    .eq('id', dep.id)
    .gte('balance', amount)
    .select('id')
    .maybeSingle()

  if (upErr) return { success: false, error: upErr.message }
  if (!updated) {
    return { success: false, error: '예치금 잔액이 부족합니다. (동시 사용)' }
  }

  const { error: logErr } = await supabase.from('deposit_logs').insert({
    tenant_id: ctx.tenant_id,
    customer_id,
    amount,
    type: 'debit',
    reason: 'order_auto_debit',
    order_id,
    payment_id: null,
  })

  if (logErr) {
    await supabase
      .from('customer_deposits')
      .update({ balance: before, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenant_id)
      .eq('id', dep.id)
    return { success: false, error: `예치금 이력 기록 실패: ${logErr.message}` }
  }

  const { error: ordErr } = await supabase
    .from('orders')
    .update({ deposit_used: amount })
    .eq('id', order_id)
    .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)

  if (ordErr) {
    // 주문 반영 실패 → 예치금·로그 정합을 위해 credit 복구 로그로 되돌림
    await supabase
      .from('customer_deposits')
      .update({ balance: before, updated_at: new Date().toISOString() })
      .eq('tenant_id', ctx.tenant_id)
      .eq('id', dep.id)
    await supabase.from('deposit_logs').insert({
      tenant_id: ctx.tenant_id,
      customer_id,
      amount,
      type: 'credit',
      reason: 'order_auto_debit_rollback',
      order_id,
      payment_id: null,
    })
    return { success: false, error: `주문 예치금 반영 실패: ${ordErr.message}` }
  }

  revalidatePath('/customers')
  revalidatePath(`/customers/${customer_id}/ledger`)
  revalidatePath(`/orders/${order_id}`)

  return { success: true, data: { deposit_used: amount, balance_after: after } }
}

/**
 * 주문 취소 시 예치금 복구 (append-only credit).
 * deposit_used > 0 이고 아직 복구 credit이 없으면 balance 복원.
 */
export async function restoreOrderDepositOnCancel(opts: {
  supabase: SupabaseServer
  ctx: AuthCtx
  order_id: string
  customer_id: string
  deposit_used: number
}): Promise<ActionResult<{ restored: number }>> {
  const { supabase, ctx, order_id, customer_id, deposit_used } = opts
  const amount = Math.max(0, Math.round(Number(deposit_used) || 0))
  if (amount <= 0) return { success: true, data: { restored: 0 } }

  const { data: existingRestore } = await supabase
    .from('deposit_logs')
    .select('id')
    .eq('tenant_id', ctx.tenant_id)
    .eq('order_id', order_id)
    .eq('type', 'credit')
    .eq('reason', 'order_cancel_restore')
    .maybeSingle()

  if (existingRestore) {
    return { success: true, data: { restored: 0 } }
  }

  const { data: dep, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, balance')
    .eq('tenant_id', ctx.tenant_id)
    .eq('customer_id', customer_id)
    .maybeSingle()

  if (depErr) return { success: false, error: depErr.message }

  const before = dep?.balance ?? 0
  const after = before + amount
  const now = new Date().toISOString()

  if (!dep) {
    const { error: insErr } = await supabase.from('customer_deposits').insert({
      tenant_id: ctx.tenant_id,
      customer_id,
      balance: after,
      updated_at: now,
    })
    if (insErr) return { success: false, error: insErr.message }
  } else {
    const { error: upErr } = await supabase
      .from('customer_deposits')
      .update({ balance: after, updated_at: now })
      .eq('tenant_id', ctx.tenant_id)
      .eq('id', dep.id)
    if (upErr) return { success: false, error: upErr.message }
  }

  const { error: logErr } = await supabase.from('deposit_logs').insert({
    tenant_id: ctx.tenant_id,
    customer_id,
    amount,
    type: 'credit',
    reason: 'order_cancel_restore',
    order_id,
    payment_id: null,
  })

  if (logErr) {
    if (dep) {
      await supabase
        .from('customer_deposits')
        .update({ balance: before, updated_at: now })
        .eq('tenant_id', ctx.tenant_id)
        .eq('id', dep.id)
    } else {
      await supabase
        .from('customer_deposits')
        .update({ balance: 0, updated_at: now })
        .eq('tenant_id', ctx.tenant_id)
        .eq('customer_id', customer_id)
    }
    return { success: false, error: `예치금 복구 이력 실패: ${logErr.message}` }
  }

  revalidatePath('/customers')
  revalidatePath(`/customers/${customer_id}/ledger`)

  return { success: true, data: { restored: amount } }
}
