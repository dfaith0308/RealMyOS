'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import styles from '../login/login.module.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowser()
    const origin = window.location.origin
    const configured = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const appOrigin =
      configured ||
      (/localhost|127\.0\.0\.1/.test(origin) ? 'https://app.siksiki.com' : origin)
    const redirectTo = `${appOrigin}/auth/callback?next=${encodeURIComponent('/reset-password')}`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })
    setLoading(false)
    if (resetError) {
      setError('요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    // 계정 존재 여부와 무관하게 동일 안내 (enumeration 방지)
    setSent(true)
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.hero}>
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

          <h1 className={styles.heading}>비밀번호 찾기</h1>
          <p className={styles.lead}>
            {sent
              ? '재설정 링크를 이메일로 보냈습니다. 메일함을 확인해주세요.'
              : '가입하신 이메일로 비밀번호 재설정 링크를 보내드립니다.'}
          </p>

          {error ? <div className={styles.error}>{error}</div> : null}

          {sent ? (
            <div className={styles.form}>
              <Link href="/login" className={styles.submit} style={{ textAlign: 'center', textDecoration: 'none' }}>
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="forgot-email">
                  아이디
                </label>
                <input
                  id="forgot-email"
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="siksiki@siksiki.com"
                  autoComplete="username"
                />
              </div>
              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? '전송 중...' : '재설정 링크 보내기'}
              </button>
              <Link href="/login" className={styles.forgotLink} style={{ textAlign: 'center' }}>
                로그인으로 돌아가기
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
