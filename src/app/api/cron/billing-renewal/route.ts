/**
 * 구독 자동 재청구 크론 — 매일 09:00 KST (vercel.json: "0 0 * * *" UTC)
 *
 * 이 라우트는 인증과 응답 포장만 한다. 실제 로직은 lib/subscription-renewal.ts.
 *
 * 인증: Vercel Cron 은 CRON_SECRET 환경변수가 있으면
 *       Authorization: Bearer <CRON_SECRET> 을 붙여 호출한다.
 *       CRON_SECRET 이 없으면 이 라우트는 아예 동작하지 않는다 — 공개 결제 트리거가
 *       되는 것보다 크론이 안 도는 편이 낫다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { runSubscriptionRenewal } from '@/lib/subscription-renewal'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/billing-renewal] CRON_SECRET 미설정 — 실행 거부')
    return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  // ?dry_run=1 — 조회·판정까지만 하고 결제하지 않는다(검증용).
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'

  try {
    const supabase = await createSupabaseAdmin()
    const summary = await runSubscriptionRenewal(supabase, { dryRun })
    console.log(
      `[cron/billing-renewal] ${summary.attempt_date}${dryRun ? ' (dry-run)' : ''} ` +
        `대상 ${summary.candidates} · 성공 ${summary.success} · 실패 ${summary.failed} · 제외 ${summary.skipped}`,
    )
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    // 크론이 500 으로 죽어도 다음 날 다시 돈다. 여기서 예외가 새어나가지 않게만 한다.
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/billing-renewal] 실행 실패', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
