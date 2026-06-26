'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export type CouponRow = {
  id: string
  code: string
  plan: 'earlybird' | 'pro' | 'annual'
  free_months: number
  max_uses: number | null
  used_count: number | null
  expires_at: string | null
  created_at: string
  created_by: string | null
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCouponCode(): string {
  return Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx || ctx.role !== 'admin') return { ok: false as const, error: '권한 없음' }
  return { ok: true as const, ctx }
}

export async function createCoupon(input: {
  plan: 'earlybird' | 'pro' | 'annual'
  free_months: number
  max_uses: number
  expires_at?: string | null
}): Promise<ActionResult<{ code: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()
  const free_months = Math.max(1, Math.min(6, Math.floor(input.free_months)))
  const max_uses = Math.max(1, Math.floor(input.max_uses))

  let lastError: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode()
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code,
        plan: input.plan,
        free_months,
        max_uses,
        expires_at: input.expires_at || null,
        created_by: auth.ctx.user_id,
      })
      .select('code')
      .single()

    if (!error && data) {
      revalidatePath('/admin/coupons')
      return { success: true, data: { code: data.code as string } }
    }
    lastError = error?.message ?? '쿠폰 생성 실패'
    if (!error?.message?.includes('duplicate')) break
  }

  return { success: false, error: lastError ?? '쿠폰 생성 실패' }
}

export async function getCoupons(): Promise<ActionResult<{ coupons: CouponRow[] }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { coupons: (data ?? []) as CouponRow[] } }
}

export async function deleteCoupon(id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createSupabaseAdmin()

  const { error: usesErr } = await supabase.from('coupon_uses').delete().eq('coupon_id', id)
  if (usesErr) return { success: false, error: usesErr.message }

  const { error } = await supabase.from('coupons').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/coupons')
  return { success: true }
}
