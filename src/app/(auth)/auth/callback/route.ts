import { createSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/'
  // open redirect 방지: 상대 경로만 허용
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/'

  if (code) {
    const supabase = await createSupabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const url = new URL('/forgot-password', origin)
      url.searchParams.set('error', 'link')
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
