import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'

const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 99000,
  annual: 948000,
}

const VALID_PLANS = new Set(['monthly', 'annual'])

function planExpiresAt(plan: string): string {
  const now = new Date()
  if (plan === 'annual') {
    const expires = new Date(now)
    expires.setFullYear(expires.getFullYear() + 1)
    return expires.toISOString()
  }
  const expires = new Date(now)
  expires.setMonth(expires.getMonth() + 1)
  return expires.toISOString()
}

export async function POST(req: NextRequest) {
  const { authKey, customerKey, plan, amount, orderName, promoCode } = await req.json()

  if (!authKey || !customerKey || !plan) {
    return NextResponse.json({ error: '결제 정보가 올바르지 않습니다' }, { status: 400 })
  }

  if (!VALID_PLANS.has(plan)) {
    return NextResponse.json({ error: '플랜이 올바르지 않습니다' }, { status: 400 })
  }

  const expectedAmount = PLAN_AMOUNTS[plan]
  if (Number(amount) !== expectedAmount) {
    return NextResponse.json({ error: '결제 금액이 플랜 금액과 일치하지 않습니다' }, { status: 400 })
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ error: '결제 키 미설정' }, { status: 500 })
  }

  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const encoded = Buffer.from(`${secretKey}:`).toString('base64')

  // 1) billing key issue
  const billingRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authKey, customerKey }),
  })
  const billingData = await billingRes.json()
  if (!billingRes.ok) {
    return NextResponse.json({ error: billingData.message ?? '빌링키 발급 실패' }, { status: 400 })
  }

  const billingKey = billingData.billingKey as string

  const adminSupabase = await createSupabaseAdmin()

  // 2) 프로모션 코드가 있으면 첫 결제를 면제(승인 호출 자체를 건너뜀)하고,
  //    없으면 기존과 동일하게 즉시 결제한다.
  //    카드(빌링키) 등록은 두 경우 모두 위에서 이미 끝났다.
  const promo = typeof promoCode === 'string' ? promoCode.trim() : ''
  let orderId: string | null = null
  let paymentKey: string | null = null
  let expiresAt = planExpiresAt(plan)
  let freeMonths: number | null = null

  if (promo) {
    // 유효성 검사 + used_count 증가 + 사용기록을 한 트랜잭션에서 처리한다.
    // 결제를 건너뛰기 전에 먼저 확정지어야 max_uses 경합에서 이중 면제가 나지 않는다.
    const { data: redeemed, error: redeemErr } = await adminSupabase.rpc('redeem_coupon', {
      p_code: promo,
      p_tenant_id: ctx.tenant_id,
      p_plan: plan,
    })

    const row = Array.isArray(redeemed) ? redeemed[0] : redeemed

    if (redeemErr || !row) {
      if (redeemErr) console.error('[toss/billing] redeem_coupon failed', redeemErr)
      // 코드를 쓰겠다고 온 요청이므로, 실패했다고 조용히 과금하지 않는다.
      return NextResponse.json(
        { error: '사용할 수 없는 프로모션 코드입니다 (만료·소진·플랜 불일치 또는 이미 사용)' },
        { status: 400 },
      )
    }

    freeMonths = row.free_months as number
    expiresAt = row.plan_expires_at as string
  } else {
    orderId = crypto.randomUUID()
    const payRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerKey,
        amount: expectedAmount,
        orderId,
        orderName: orderName ?? `공급자OS ${plan === 'annual' ? '연간' : '월간'} 구독`,
      }),
    })
    const payData = await payRes.json()
    if (!payRes.ok) {
      return NextResponse.json({ error: payData.message ?? '결제 승인 실패' }, { status: 400 })
    }
    paymentKey = payData.paymentKey ?? null
  }

  // 3) tenants update (server-side secret)
  const subscribedAt = new Date().toISOString()

  const { error: tenantErr } = await adminSupabase
    .from('tenants')
    .update({
      subscription_plan: plan,
      subscribed_at: subscribedAt,
      plan_expires_at: expiresAt,
      billing_key: billingKey,
      toss_customer_key: customerKey,
      is_approved: true,
    })
    .eq('id', ctx.tenant_id)

  if (tenantErr) {
    console.error('[toss/billing] tenant update failed after payment', tenantErr, {
      tenant_id: ctx.tenant_id,
      promo_used: promo || null,
    })
    return NextResponse.json({ error: '구독 정보 저장에 실패했습니다. 고객센터에 문의해 주세요.' }, { status: 500 })
  }

  revalidatePath('/subscribe')
  revalidatePath('/dashboard')

  return NextResponse.json({ success: true, orderId, paymentKey, freeMonths })
}

