import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {}
        },
      },
    },
  )
}

// ============================================================
// 공통 인증 헬퍼
// getUser() 1회 — tenant_id는 user_metadata에서 직접 읽음
// users 테이블 추가 조회 없음
// ============================================================

export interface AuthCtx {
  user_id:   string
  tenant_id: string
  user_type: string
}

export async function getAuthCtx(supabase: any): Promise<AuthCtx | null> {
  const _t = Date.now()

  const { data: { user }, error } = await supabase.auth.getUser()
  console.error(`[PERF:AUTH] getUser: ${Date.now() - _t}ms`)

  if (error || !user) return null

  const tenant_id = user.user_metadata?.tenant_id as string | undefined
  if (!tenant_id) {
    console.error('[PERF:AUTH] tenant_id missing in user_metadata — user:', user.id)
    return null
  }

  return {
    user_id:   user.id,
    tenant_id,
    user_type: 'human',
  }
}
