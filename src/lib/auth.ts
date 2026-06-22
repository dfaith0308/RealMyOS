'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

export async function requireAdmin(): Promise<void> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) throw new Error('로그인 필요')
  if (ctx.role !== 'admin') throw new Error('권한 없음')
}
