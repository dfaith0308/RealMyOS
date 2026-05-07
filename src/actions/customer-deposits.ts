'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

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
    .select('id, amount, type, reason, payment_id, created_at')
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

