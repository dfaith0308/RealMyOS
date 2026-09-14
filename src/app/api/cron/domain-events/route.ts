/**
 * 자체 사건 처리 크론 — 배송 완료 메시지 등.
 *
 * **vercel.json 에 아직 등록하지 않았다(승인 대기).** 배송 상태 입력 직후와 관리자 「지금 한 번 돌려보기」로도
 * 처리되므로, 이 라우트는 그 경로가 실패했을 때 남은 사건을 줍는 안전망이다.
 *
 * 인증: billing-renewal 크론과 같다 — CRON_SECRET 이 없으면 아예 동작하지 않는다.
 * 실제 발송 여부는 lib/delivery-message/safety.ts 안전장치(열쇠·스위치·preview)가 따로 막는다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { drainDomainEvents } from '@/lib/domain-events/drain'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/domain-events] CRON_SECRET 미설정 — 실행 거부')
    return NextResponse.json({ error: 'CRON_SECRET 미설정' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = await createSupabaseAdmin()
    const res = await drainDomainEvents(admin, null)
    if (!res.ok) {
      console.error('[cron/domain-events] 실패', res.error)
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
    }
    return NextResponse.json(res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/domain-events] 실행 실패', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
