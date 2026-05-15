'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface CustomerTagItem {
  id: string
  category: string
  value: string
  is_active: boolean
  created_at: string
  updated_at: string
}

async function assertCustomerScope(opts: {
  supabase: any
  tenant_id: string
  customer_id: string
}) {
  const { data: customer } = await opts.supabase
    .from('customers')
    .select('id')
    .eq('id', opts.customer_id)
    .eq('tenant_id', opts.tenant_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!customer) throw new Error('거래처를 찾을 수 없습니다.')
}

export async function getCustomerTags(
  customer_id: string,
): Promise<ActionResult<Array<Pick<CustomerTagItem, 'id' | 'category' | 'value'>>>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    await assertCustomerScope({ supabase, tenant_id: ctx.tenant_id, customer_id })

    const { data, error } = await supabase
      .from('customer_tags')
      .select('id, category, value')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', customer_id)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('value', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data ?? [] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return { success: false, error: msg }
  }
}

export async function upsertCustomerTag(input: {
  customer_id: string
  category: string
  value: string
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const category = (input.category ?? '').trim()
  const value = (input.value ?? '').trim()
  if (!category) return { success: false, error: 'category 필수' }
  if (!value) return { success: false, error: 'value 필수' }

  try {
    await assertCustomerScope({ supabase, tenant_id: ctx.tenant_id, customer_id: input.customer_id })

    const { data: existing, error: exErr } = await supabase
      .from('customer_tags')
      .select('id, value')
      .eq('tenant_id', ctx.tenant_id)
      .eq('customer_id', input.customer_id)
      .eq('category', category)
      .eq('is_active', true)
      .maybeSingle()
    if (exErr) return { success: false, error: exErr.message }

    // no-op
    if (existing && existing.value === value) {
      return { success: true, data: { id: existing.id } }
    }

    if (!existing) {
      const { data: created, error: insErr } = await supabase
        .from('customer_tags')
        .insert({
          tenant_id: ctx.tenant_id,
          customer_id: input.customer_id,
          category,
          value,
          is_active: true,
        })
        .select('id')
        .single()

      if (insErr || !created) return { success: false, error: insErr?.message ?? '저장 실패' }

      const { error: logErr } = await supabase.from('customer_tag_logs').insert({
        tenant_id: ctx.tenant_id,
        customer_id: input.customer_id,
        category,
        before_value: null,
        after_value: value,
        action: 'create',
        actor_id: ctx.user_id,
      })

      // 로그 실패 시 생성 rollback (물리 삭제 금지 → 비활성화로 롤백)
      if (logErr) {
        await supabase
          .from('customer_tags')
          .update({ is_active: false })
          .eq('id', created.id)
          .eq('tenant_id', ctx.tenant_id)
        return { success: false, error: `로그 기록 실패: ${logErr.message}` }
      }

      revalidatePath(`/customers/${input.customer_id}`)
      return { success: true, data: { id: created.id } }
    }

    // update path
    const before = existing.value
    const { error: upErr } = await supabase
      .from('customer_tags')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('tenant_id', ctx.tenant_id)

    if (upErr) return { success: false, error: upErr.message }

    const { error: logErr } = await supabase.from('customer_tag_logs').insert({
      tenant_id: ctx.tenant_id,
      customer_id: input.customer_id,
      category,
      before_value: before,
      after_value: value,
      action: 'update',
      actor_id: ctx.user_id,
    })

    // 로그 실패 시 업데이트 롤백
    if (logErr) {
      await supabase
        .from('customer_tags')
        .update({ value: before, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('tenant_id', ctx.tenant_id)
      return { success: false, error: `로그 기록 실패: ${logErr.message}` }
    }

    revalidatePath(`/customers/${input.customer_id}`)
    return { success: true, data: { id: existing.id } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return { success: false, error: msg }
  }
}

export async function deactivateCustomerTag(
  id: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  try {
    const { data: existing, error: exErr } = await supabase
      .from('customer_tags')
      .select('id, customer_id, category, value, is_active')
      .eq('id', id)
      .eq('tenant_id', ctx.tenant_id)
      .maybeSingle()
    if (exErr) return { success: false, error: exErr.message }
    if (!existing) return { success: false, error: '태그를 찾을 수 없습니다.' }
    if (!existing.is_active) return { success: true }

    const { error: upErr } = await supabase
      .from('customer_tags')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenant_id)
    if (upErr) return { success: false, error: upErr.message }

    const { error: logErr } = await supabase.from('customer_tag_logs').insert({
      tenant_id: ctx.tenant_id,
      customer_id: existing.customer_id,
      category: existing.category,
      before_value: existing.value,
      after_value: null,
      action: 'deactivate',
      actor_id: ctx.user_id,
    })

    // 로그 실패 시 롤백(활성 복구)
    if (logErr) {
      await supabase
        .from('customer_tags')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', ctx.tenant_id)
      return { success: false, error: `로그 기록 실패: ${logErr.message}` }
    }

    revalidatePath(`/customers/${existing.customer_id}`)
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return { success: false, error: msg }
  }
}

