'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export type SubscriptionPlan = 'free' | 'monthly' | 'earlybird' | 'pro' | 'annual'

const PLAN_MONTHS: Record<SubscriptionPlan, number | null> = {
  free: null,
  monthly: 1,
  earlybird: 3,
  pro: 1,
  annual: 12,
}

export async function updateTenantSubscription(input: {
  tenant_id: string
  plan: SubscriptionPlan
  custom_expires_at?: string  // ISO string — 쿠폰 등 수동 지정 시
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { success: false, error: '권한 없음' }

  const now = new Date()
  let plan_expires_at: string | null = null

  if (input.custom_expires_at) {
    plan_expires_at = input.custom_expires_at
  } else {
    const months = PLAN_MONTHS[input.plan]
    if (months) {
      const expires = new Date(now)
      expires.setMonth(expires.getMonth() + months)
      plan_expires_at = expires.toISOString()
    }
  }

  const { error } = await supabase
    .from('tenants')
    .update({
      subscription_plan: input.plan,
      subscribed_at: input.plan === 'free' ? null : now.toISOString(),
      plan_expires_at,
      is_approved: input.plan !== 'free',
    })
    .eq('id', input.tenant_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/tenants')
  return { success: true }
}
