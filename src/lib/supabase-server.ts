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
  role:      string
  user_type: string
}

// admin 계정이 tenant_id 를 가지지 않는 경우가 있어, 안전한 sentinel 값을 둔다.
// - admin 페이지는 tenant_id 기반 쿼리를 사용하지 않고 RLS(is_admin())로 보호되는 액션을 사용해야 한다.
// - tenant_id 가 필요한 (app) 영역에서는 getAuthCtx()가 null 반환 또는 호출부에서 tenant_id 존재를 전제한다.
const ADMIN_TENANT_ID = '00000000-0000-0000-0000-000000000000'

export async function getAuthCtx(supabase: any): Promise<AuthCtx | null> {
  const _t = Date.now()

  const { data: { user }, error } = await supabase.auth.getUser()
  console.error(`[PERF:AUTH] getUser: ${Date.now() - _t}ms`)

  if (error || !user) return null

  let tenant_id = user.user_metadata?.tenant_id as string | undefined
  let role      = user.user_metadata?.role as string | undefined

  // users 테이블에서 role/tenant_id 조회 (admin gate 포함 공통 SSOT)
  const { data: userRow, error: userRowErr } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (userRowErr) {
    console.error('[PERF:AUTH] users 테이블 조회 실패:', userRowErr)
  }

  if (!role) role = (userRow as any)?.role ?? undefined

  // fallback: user_metadata에 없으면 users 테이블에서 조회
  if (!tenant_id) {
    console.error('[PERF:AUTH] tenant_id missing in user_metadata — fallback to users table, user:', user.id)
    tenant_id = (userRow as any)?.tenant_id ?? undefined

    // fallback 성공 시 user_metadata 비동기 동기화 (다음 요청부터 빠르게)
    if (tenant_id) {
      supabase.auth.updateUser({ data: { tenant_id } }).catch((e: unknown) => {
        console.error('[PERF:AUTH] user_metadata 동기화 실패:', e)
      })
    }
  }

  // admin은 tenant_id가 null일 수 있음 (운영 계정)
  if (!tenant_id && role === 'admin') {
    return {
      user_id: user.id,
      tenant_id: ADMIN_TENANT_ID,
      role,
      user_type: 'admin',
    }
  }

  if (!tenant_id) {
    console.error('[PERF:AUTH] tenant_id 최종 없음 — user:', user.id)
    return null
  }

  return {
    user_id:   user.id,
    tenant_id,
    role:      role ?? 'unknown',
    user_type: role === 'admin' ? 'admin' : 'human',
  }
}
