'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import styles from '../login/login.module.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowser()

    async function check() {
      const { data } = await supabase.auth.getSession()
      setHasSession(!!data.session)
      setChecking(false)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setHasSession(!!session)
        setChecking(false)
      }
    })

    void check()
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(updateError.message || '비밀번호를 변경하지 못했습니다.')
      return
    }
    setDone(true)
    setTimeout(() => {
      router.push('/login')
      router.refresh()
    }, 1500)
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

          <h1 className={styles.heading}>새 비밀번호 설정</h1>
          <p className={styles.lead}>
            {done
              ? '비밀번호가 변경되었습니다. 로그인 화면으로 이동합니다.'
              : checking
                ? '세션을 확인하는 중…'
                : hasSession
                  ? '새로운 비밀번호를 입력해주세요.'
                  : '유효한 재설정 링크가 없습니다. 비밀번호 찾기를 다시 진행해주세요.'}
          </p>

          {error ? <div className={styles.error}>{error}</div> : null}

          {!checking && !hasSession && !done ? (
            <div className={styles.form}>
              <Link href="/forgot-password" className={styles.submit} style={{ textAlign: 'center', textDecoration: 'none' }}>
                비밀번호 찾기
              </Link>
              <Link href="/login" className={styles.forgotLink} style={{ textAlign: 'center' }}>
                로그인으로 돌아가기
              </Link>
            </div>
          ) : null}

          {hasSession && !done ? (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-password">
                  새 비밀번호
                </label>
                <div className={styles.passwordWrap}>
                  <input
                    id="new-password"
                    className={styles.input}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="8자 이상"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  >
                    {showPassword ? '숨김' : '표시'}
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="confirm-password">
                  새 비밀번호 확인
                </label>
                <input
                  id="confirm-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  placeholder="한 번 더 입력"
                  autoComplete="new-password"
                />
              </div>
              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          ) : null}

          {done ? (
            <Link href="/login" className={styles.submit} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              로그인
            </Link>
          ) : null}
        </div>
      </main>
    </div>
  )
}
