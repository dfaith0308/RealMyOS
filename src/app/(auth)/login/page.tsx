'use client'
import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
    } else {
      const isAdmin = window.location.hostname.startsWith('admin.')
      router.push(isAdmin ? '/admin/dashboard' : '/dashboard')
      router.refresh()
    }
  }

  const isAdmin = typeof window !== 'undefined' && window.location.hostname.startsWith('admin.')

  if (isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1923',
        backgroundImage: 'linear-gradient(rgba(31,93,58,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(31,93,58,0.15) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}>
        <div style={{
          width: 360,
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '40px 36px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(31,93,58,0.3)',
            border: '0.5px solid rgba(31,93,58,0.6)',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 11, color: '#6fcf97',
            marginBottom: 20, letterSpacing: '0.04em',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6fcf97', display: 'inline-block' }} />
            관리자 전용
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#ffffff', margin: '0 0 4px' }}>식식이 관리자</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px' }}>
            플랫폼 운영 콘솔 — 인가된 접근만 허용됩니다
          </p>
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.15)', color: '#fca5a5', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>이메일</label>
              <input
                style={{ padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 14, color: '#ffffff', outline: 'none' }}
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="admin@siksiki.com"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>비밀번호</label>
              <input
                style={{ padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 14, color: '#ffffff', outline: 'none' }}
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required placeholder="••••••••"
              />
            </div>
            <button
              style={{ marginTop: 4, padding: '13px', background: loading ? '#374151' : '#1f5d3a', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}
              type="submit" disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
          <hr style={{ border: 'none', borderTop: '0.5px solid rgba(255,255,255,0.08)', margin: '24px 0 16px' }} />
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: 0 }}>
            식식이OS · 디닷페이스 내부 시스템
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.logo}>RealMyOS</h1>
        <p style={s.sub}>식식이 ERP</p>
        {error && <div style={s.err}>{error}</div>}
        <form onSubmit={handleLogin} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>이메일</label>
            <input
              style={s.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>비밀번호</label>
            <input
              style={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <button style={loading ? s.btnOff : s.btn} type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' },
  card: { width: 360, background: '#fff', borderRadius: 12, padding: '40px 36px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  logo: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  sub: { color: '#888', fontSize: 13, marginBottom: 28 },
  err: { background: '#FEF2F2', color: '#DC2626', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 500, color: '#555' },
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none' },
  btn: { marginTop: 8, padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  btnOff: { marginTop: 8, padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'not-allowed' },
}
