'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { updateActionConversion } from '@/actions/action-log'
import type { ConversionStatus } from '@/actions/action-log'
import type { ActionResult } from '@/types/order'
import type { CustomerStatusType, OutcomeType } from '@/lib/contact-options'

export type ContactMethod = 'call' | 'visit' | 'message' | 'payment'
export type ContactResult  = 'connected' | 'no_answer' | 'interested' | 'rejected' | 'scheduled'
export type NextActionType = 'call' | 'visit' | 'message'

export type { CustomerStatusType, OutcomeType }
export interface CreateContactLogInput {
  customer_id:        string
  contact_method:     ContactMethod
  memo?:              string
  action_log_id?:     string
  conversion_status?: ConversionStatus
  result?:            ContactResult
  next_action_date?:  string
  next_action_type?:  NextActionType
  outcome_type?:      OutcomeType
  customer_status?:   CustomerStatusType
  schedule_id?:       string | null
  methods?:           string[]
}

export async function createContactLog(
  input: CreateContactLogInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServer()
    const ctxRaw   = await getAuthCtx(supabase)
    if (!ctxRaw) return { success: false, error: '로그인 필요' }
    const ctx = ctxRaw

    // ── 거래처 존재 확인 ────────────────────────────────────
    const { data: customer, error: custCheckErr } = await supabase
      .from('customers')
      .select('id')
      .is('deleted_at', null)
      .eq('id', input.customer_id)
      .eq('tenant_id', ctx.tenant_id)
      .single()

    if (custCheckErr || !customer) {
      console.error('[createContactLog] customer check error:', custCheckErr)
      return { success: false, error: custCheckErr?.message ?? '유효하지 않은 거래처' }
    }

    // ── next_action_date 자동 계산 (PRODUCT §6-13) ─────────────
    async function calcAvgCycle90Days(customerId: string): Promise<number> {
      const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
      const today = new Date(todayStr + 'T00:00:00Z')
      const d90ago = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10)

      const { data } = await supabase
        .from('orders')
        .select('order_date')
        .or(`seller_tenant_id.eq.${ctx.tenant_id},tenant_id.eq.${ctx.tenant_id}`)
        .eq('customer_id', customerId)
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .gte('order_date', d90ago)
        .order('order_date', { ascending: true })

      const dates = (data ?? []).map((r: any) => r.order_date).filter(Boolean)
      if (dates.length < 3) return 7
      const gaps: number[] = []
      for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i] + 'T00:00:00Z').getTime() - new Date(dates[i - 1] + 'T00:00:00Z').getTime()) / 86400000
        if (diff > 0) gaps.push(diff)
      }
      if (!gaps.length) return 7
      return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
    }

    function calcNextActionDate(outcome: string, avgCycle: number): string {
      const cycle = Math.max(1, avgCycle || 7)
      const fixed2 = new Set(['no_answer'])
      if (fixed2.has(outcome)) {
        const d = new Date(Date.now() + 9 * 3600000)
        d.setDate(d.getDate() + 2)
        return d.toISOString().slice(0, 10)
      }

      const mult: Record<string, number> = {
        interested: 0.3,
        potential: 0.5,
        maintained: 0.8,
        churn_risk: 0.2,
        rejected: 2.0,
        order_placed: 0.9,
      }
      const days = Math.max(1, Math.round(cycle * (mult[outcome] ?? 1)))
      const d = new Date(Date.now() + 9 * 3600000)
      d.setDate(d.getDate() + days)
      return d.toISOString().slice(0, 10)
    }

    let next_action_date = input.next_action_date ?? null
    let next_action_type = input.next_action_type ?? null
    if (!next_action_date && input.outcome_type) {
      try {
        const avg = await calcAvgCycle90Days(input.customer_id)
        next_action_date = calcNextActionDate(input.outcome_type, avg)
        next_action_type = (input.next_action_type ?? 'call') as any
      } catch {
        // fallback: 7일
        const d = new Date(Date.now() + 9 * 3600000)
        d.setDate(d.getDate() + 7)
        next_action_date = d.toISOString().slice(0, 10)
        next_action_type = (input.next_action_type ?? 'call') as any
      }
    }

    // ── insert payload ────────────────────────────────────────
    const payload = {
      tenant_id:        ctx.tenant_id,
      customer_id:      input.customer_id,
      contact_method:   input.contact_method,
      memo:             input.memo              ?? null,
      contacted_by:     ctx.user_id             ?? null,
      contacted_at:     new Date().toISOString(),
      action_log_id:    input.action_log_id     ?? null,
      outcome_type:     input.outcome_type      ?? null,
      customer_status:  input.customer_status   ?? null,
      next_action_date,
      next_action_type,
      schedule_id:      input.schedule_id       ?? null,
      methods:          input.methods           ?? null,
      // 레거시 — 기존 코드 호환
      outcome:          input.result ?? input.outcome_type ?? null,
      result:           input.result ?? input.outcome_type ?? null,
    }

    // ── insert ────────────────────────────────────────────────
    const { data, error: insertErr } = await supabase
      .from('contact_logs')
      .insert(payload)
      .select('id')
      .single()

    if (insertErr || !data) {
      console.error('[createContactLog] insert error:', insertErr)
      return {
        success: false,
        error:   `INSERT 실패: ${insertErr?.message ?? 'unknown'} (code: ${insertErr?.code ?? '-'})`,
      }
    }


    // ── customers 동기화 (실패해도 이력 저장은 유지) ──────────
    try {
      const custUpdate: Record<string, string | null> = {
        last_contact_date: new Date().toISOString(),
      }
      if (input.outcome_type)    custUpdate.last_contact_outcome = input.outcome_type
      if (input.customer_status) custUpdate.sales_status         = input.customer_status

      const { error: custErr } = await supabase
        .from('customers')
        .update(custUpdate)
        .eq('id', input.customer_id)
        .eq('tenant_id', ctx.tenant_id)

      if (custErr) console.error('[createContactLog] customers sync error:', custErr.message)
    } catch (syncErr) {
      console.error('[createContactLog] customers sync exception:', syncErr)
    }

    // ── action_log conversion (레거시) ────────────────────────
    if (input.action_log_id && input.conversion_status) {
      await updateActionConversion(input.action_log_id, input.conversion_status, data.id)
    }

    revalidatePath('/customers')
    return { success: true, data: { id: data.id } }

  } catch (e: any) {
    console.error('[createContactLog] unexpected error:', e)
    return {
      success: false,
      error:   `예외 발생: ${e?.message ?? 'UNKNOWN_ERROR'}`,
    }
  }
}