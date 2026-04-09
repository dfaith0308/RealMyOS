import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          list.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { pathname } = request.nextUrl

  // 공개 경로 — 인증 불필요
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')
  if (isPublic) return supabaseResponse

  // getSession() — 쿠키 파싱만 (네트워크 호출 없음)
  // getUser()는 Server Component에서 1회만 실행 (getAuthCtx)
  const { data: { session } } = await supabase.auth.getSession()

  // 비로그인 → /login
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // /onboarding 자체는 통과
  if (pathname.startsWith('/onboarding')) return supabaseResponse

  // tenant_id는 user_metadata에서 읽음 — users 테이블 조회 없음
  const tenant_id = session.user?.user_metadata?.tenant_id
  if (!tenant_id) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  // 루트(/) → /dashboard
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
