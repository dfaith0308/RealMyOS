'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

export type SubscriptionPlan = 'free' | 'monthly' | 'annual' | 'earlybird' | 'pro'

export async function getSubscriptionStatus(): Promise<{
  plan: SubscriptionPlan
  subscribed_at: string | null
  plan_expires_at: string | null
  is_active: boolean
}> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { plan: 'free', subscribed_at: null, plan_expires_at: null, is_active: false }

  const { data } = await supabase
    .from('tenants')
    .select('subscription_plan, subscribed_at, plan_expires_at')
    .eq('id', ctx.tenant_id)
    .maybeSingle()

  const plan = (data?.subscription_plan ?? 'free') as SubscriptionPlan
  const is_active = plan !== 'free'

  return {
    plan,
    subscribed_at: data?.subscribed_at ?? null,
    plan_expires_at: data?.plan_expires_at ?? null,
    is_active,
  }
}

