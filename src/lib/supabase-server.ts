import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  const schema = process.env.SUPABASE_DB_SCHEMA ?? 'public'

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
            )
          } catch {}
        },
      },
    },
  )
}

// ============================================================
// 공통 인증 헬퍼
// 1순위: user_metadata.tenant_id (빠름 — DB 조회 없음)
// 2순위: users 테이블 fallback (user_metadata 누락 시)
//        → fallback 성공 시 user_metadata 비동기 동기화
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

  let tenant_id = user.user_metadata?.tenant_id as string | undefined

  // fallback: user_metadata에 없으면 users 테이블에서 조회
  if (!tenant_id) {
    console.error('[PERF:AUTH] tenant_id missing in user_metadata — fallback to users table, user:', user.id)

    const { data: userRow } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    tenant_id = userRow?.tenant_id ?? undefined

    // fallback 성공 시 user_metadata 비동기 동기화 (다음 요청부터 빠르게)
    if (tenant_id) {
      supabase.auth.updateUser({ data: { tenant_id } }).catch((e: unknown) => {
        console.error('[PERF:AUTH] user_metadata 동기화 실패:', e)
      })
    }
  }

  if (!tenant_id) {
    console.error('[PERF:AUTH] tenant_id 최종 없음 — user:', user.id)
    return null
  }

  return {
    user_id:   user.id,
    tenant_id,
    user_type: 'human',
  }
}