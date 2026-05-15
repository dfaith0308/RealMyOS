'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

export type NotificationRow = {
  id: string
  type: string
  priority: string
  title: string
  message: string
  action_link: string | null
  is_read: boolean | null
  created_at: string | null
}

/** 공급자 알림함 — RULE-01: ctx.tenant_id만 조회. */
export async function getNotifications(): Promise<{
  data: NotificationRow[] | null
  error: string | null
}> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { data: null, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, priority, title, message, action_link, is_read, created_at')
    .eq('tenant_id', ctx.tenant_id)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { data: null, error: error.message }
  return { data: data as NotificationRow[], error: null }
}

export async function getUnreadNotificationCount(): Promise<{
  count: number
  error: string | null
}> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { count: 0, error: '로그인 필요' }

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_read', false)

  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}

export async function markNotificationRead(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/rfq')
  return { success: true }
}
