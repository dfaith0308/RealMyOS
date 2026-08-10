'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'

const SAVED_EMAIL_KEY = 'siksiki.supplier.login.email'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hostReady, setHostReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsAdmin(window.location.hostname.startsWith('admin.'))
    setHostReady(true)
    try {
      const saved = localStorage.getItem(SAVED_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRememberEmail(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowser()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (authError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }

    try {
      if (rememberEmail) localStorage.setItem(SAVED_EMAIL_KEY, email.trim())
      else localStorage.removeItem(SAVED_EMAIL_KEY)
    } catch {
      /* ignore */
    }

    const adminHost = window.location.hostname.startsWith('admin.')
    router.push(adminHost ? '/admin/dashboard' : '/dashboard')
    router.refresh()
  }

  if (!hostReady) {
    return <div style={{ minHeight: '100vh', background: '#fff' }} />
  }

  if (isAdmin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1923',
          backgroundImage:
            'linear-gradient(rgba(31,93,58,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(31,93,58,0.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <div
          style={{
            width: 360,
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '40px 36px',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(31,93,58,0.3)',
              border: '0.5px solid rgba(31,93,58,0.6)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 11,
              color: '#6fcf97',
              marginBottom: 20,
              letterSpacing: '0.04em',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#6fcf97',
                display: 'inline-block',
              }}
            />
            관리자 전용
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', margin: '0 0 4px' }}>
            식식이 관리자
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px' }}>
            플랫폼 운영 콘솔 — 인가된 접근만 허용됩니다
          </p>
          {error && (
            <div
              style={{
                background: 'rgba(220,38,38,0.15)',
                color: '#fca5a5',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
                이메일
              </label>
              <input
                style={{
                  padding: '11px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#ffffff',
                  outline: 'none',
                }}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@siksiki.com"
                autoComplete="username"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
                비밀번호
              </label>
              <input
                style={{
                  padding: '11px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  fontSize: 14,
                  color: '#ffffff',
                  outline: 'none',
                }}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              style={{
                marginTop: 4,
                padding: '13px',
                background: loading ? '#374151' : '#1f5d3a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              type="submit"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
          <hr
            style={{
              border: 'none',
              borderTop: '0.5px solid rgba(255,255,255,0.08)',
              margin: '24px 0 16px',
            }}
          />
          <p
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.25)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            식식이OS · 디닷페이스 내부 시스템
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.hero} aria-hidden={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.heroImg} src="/login-hero.png" alt="" />
        <div className={styles.heroScrim} />
        <div className={styles.heroCopy}>
          <p className={styles.heroTitle}>
            사장님의 식자재 공급,
            <br />
            더 효율적으로 관리하세요.
          </p>
          <p className={styles.heroSub}>
            식식이OS 공급자OS와 함께 스마트한 공급망을 만들어가세요.
          </p>
        </div>
      </aside>

      <main className={styles.panel}>
        <div className={styles.panelInner}>
          <div className={styles.brand}>
            <div className={styles.logoRow}>
              <span className={styles.logoMain}>식식이</span>
              <span className={styles.logoOs}>OS</span>
            </div>
            <div className={styles.brandSub}>공급자OS</div>
          </div>

          <h1 className={styles.heading}>로그인</h1>
          <p className={styles.lead}>공급자OS에 오신 것을 환영합니다.</p>

          {error ? <div className={styles.error}>{error}</div> : null}

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-email">
                아이디
              </label>
              <input
                id="login-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="siksiki@siksiki.com"
                autoComplete="username"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">
                비밀번호
              </label>
              <div className={styles.passwordWrap}>
                <input
                  id="login-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className={styles.rowBetween}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                />
                아이디 저장
              </label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                비밀번호 찾기
              </Link>
            </div>

            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.5 10.6a2.8 2.8 0 0 0 3.9 3.9M7 7.3C4.7 8.7 3 12 3 12s3.5 7 9.5 7c1.8 0 3.4-.5 4.8-1.2M14.1 6.4A10 10 0 0 1 12.5 5C6.5 5 3 12 3 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
