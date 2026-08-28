'use server'

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

/**
 * 구독 결제 화면의 프로모션 코드 "확인" 버튼용 — 읽기 전용.
 * 여기서는 절대 사용 처리를 하지 않는다. 실제 차감(used_count 증가)은
 * 결제 승인 시점에 redeem_coupon() RPC 가 원자적으로 수행한다.
 */
export type PromoCheckResult = {
  valid: boolean
  free_months?: number
  message: string
}

export async function validatePromoCode(input: {
  code: string
  plan: string
}): Promise<PromoCheckResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { valid: false, message: '로그인이 필요합니다' }

  const code = (input.code ?? '').trim()
  if (!code) return { valid: false, message: '코드를 입력하세요' }

  const admin = await createSupabaseAdmin()

  const { data: coupon, error } = await admin
    .from('coupons')
    .select('id, code, plan, free_months, max_uses, used_count, expires_at')
    .ilike('code', code)
    .maybeSingle()

  if (error) return { valid: false, message: '코드를 확인하지 못했습니다' }
  if (!coupon) return { valid: false, message: '존재하지 않는 코드입니다' }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) {
    return { valid: false, message: '만료된 코드입니다' }
  }

  const used = coupon.used_count ?? 0
  if (coupon.max_uses !== null && used >= coupon.max_uses) {
    return { valid: false, message: '사용 횟수가 모두 소진된 코드입니다' }
  }

  if (coupon.plan !== 'any' && coupon.plan !== input.plan) {
    return { valid: false, message: '선택한 플랜에는 사용할 수 없는 코드입니다' }
  }

  // 같은 테넌트가 같은 코드를 두 번 쓰는 것은 결제 시점에도 막힌다 — 미리 알려준다
  const { data: already } = await admin
    .from('coupon_uses')
    .select('id')
    .eq('coupon_id', coupon.id)
    .eq('tenant_id', ctx.tenant_id)
    .limit(1)
    .maybeSingle()

  if (already?.id) return { valid: false, message: '이미 사용한 코드입니다' }

  return {
    valid: true,
    free_months: coupon.free_months,
    message: `${coupon.free_months}개월 무료 — 첫 결제가 면제됩니다`,
  }
}
