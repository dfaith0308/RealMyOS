// ============================================================
// RealMyOS - 온보딩 페이지
// src/app/onboarding/page.tsx
// tenant_id가 없는 유저가 로그인하면 여기로 옴
// ============================================================

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import Link from 'next/link'

export default function OnboardingPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) { setError('회사명을 입력해주세요.'); return }
    if (!agreeTerms || !agreePrivacy) {
      setError('이용약관 및 개인정보처리방침에 동의해야 가입할 수 있습니다.')
      return
    }
    setError(null)

    startTransition(async () => {
      const supabase = createSupabaseBrowser()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('로그인 상태를 확인해주세요.'); return }

      // tenant 생성
      const slug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + user.id.slice(0, 6)

      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .insert({ name: companyName.trim(), slug })
        .select('id')
        .single()

      if (tenantErr || !tenant) {
        setError('회사 정보 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      // users 연결
      const { error: userErr } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          tenant_id: tenant.id,
          role: 'supplier',
          user_type: 'human',
          email: user.email,
        }, { onConflict: 'id' })

      if (userErr) {
        setError('계정 연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      // user_metadata에 tenant_id 세팅 (getAuthCtx 성능 최적화)
      // 실패해도 getAuthCtx fallback이 users 테이블에서 읽으므로 치명적이지 않음
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { tenant_id: tenant.id }
      })
      if (metaErr) {
        console.error('[onboarding] updateUser metadata 실패:', metaErr.message)
      }

      // 완료 → /customers로
      router.push('/customers')
      router.refresh()
    })
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#f8f9fa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 400, background: '#fff', borderRadius: 12,
        padding: '40px 36px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>시작하기</h1>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 28 }}>
          회사명을 입력하면 바로 사용할 수 있습니다.
        </p>

        {error && (
          <div style={{
            background: '#FEF2F2', color: '#DC2626',
            border: '1px solid #FECACA', borderRadius: 8,
            padding: '10px 14px', fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
              회사명 *
            </label>
            <input
              style={{
                padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, outline: 'none',
              }}
              placeholder="예: 식식이 납품"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#374151' }}>
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <b>[필수]</b> 이용약관에 동의합니다.{' '}
                <Link href="/terms" style={{ color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}>
                  보기
                </Link>
              </span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#374151' }}>
              <input
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <b>[필수]</b> 개인정보처리방침에 동의합니다.{' '}
                <Link href="/privacy" style={{ color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}>
                  보기
                </Link>
              </span>
            </label>
          </div>

          <button
            type="submit"
            style={{
              padding: '12px',
              background: isPending ? '#9ca3af' : '#111827',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 500,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
            disabled={isPending}
          >
            {isPending ? '설정 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </main>
  )
}
