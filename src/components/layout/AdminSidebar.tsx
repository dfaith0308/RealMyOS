'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

type MenuItem = {
  label: string
  icon: string
  href: string
  soon?: boolean
}

const MENU: MenuItem[] = [
  { label: '대시보드', icon: '🧭', href: '/admin/dashboard' },
  { label: '거래관제', icon: '🧬', href: '/admin/trades' },
  { label: '참여자', icon: '🧠', href: '/admin/participants' },
  { label: '학습센터', icon: '🧪', href: '/admin/learning' },
  { label: '분석엔진', icon: '🧷', href: '/admin/engine' },
  { label: '성장/영업 엔진', icon: '🚀', href: '/admin/growth' },
  { label: '수익/정산 통제', icon: '💹', href: '/admin/settlements' },
  { label: '정책/실험 콘솔', icon: '⚙️', href: '/admin/policy' },
  { label: '테넌트관리', icon: '🏢', href: '/admin/tenants' },
  { label: '상품관리', icon: '🛍️', href: '/admin/commerce/products' },
  { label: '카테고리', icon: '📂', href: '/admin/commerce/categories' },
  { label: '주문처리', icon: '📦', href: '/admin/commerce/orders' },
  { label: '지급 예정(allocation)', icon: '🧾', href: '/admin/commerce/allocations' },
  { label: '공급자 지급 원장', icon: '📒', href: '/admin/commerce/payables' },
  { label: '스토어 무통장', icon: '🏦', href: '/admin/commerce/storefront-bank' },
  { label: '가격 정책', icon: '🏷️', href: '/admin/commerce/pricing' },
  { label: '로그', icon: '🧾', href: '/admin/logs' },
]

const STORAGE_KEY = 'admin-theme'

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const isDark = saved === 'dark'
    setDark(isDark)
    document.documentElement.setAttribute('data-admin-theme', isDark ? 'dark' : 'light')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    const val = next ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, val)
    document.documentElement.setAttribute('data-admin-theme', val)
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navBg = dark ? '#111827' : '#ffffff'
  const navBorder = dark ? '#1f2937' : '#e5e7eb'
  const textColor = dark ? '#e8e8e8' : '#374151'
  const activeColor = dark ? '#4ade80' : 'var(--color-primary)'
  const activeBg = dark ? 'rgba(74,222,128,0.1)' : 'var(--color-primary-light)'

  return (
    <nav style={{ ...s.nav, background: navBg, borderRight: `1px solid ${navBorder}` }}>
      <div style={{ ...s.logo, borderBottom: `1px solid ${navBorder}` }}>
        <span style={{ fontSize: 22 }}>🛡️</span>
        <span style={{ ...s.logoText, color: activeColor }}>관리자 OS</span>
      </div>

      <div style={s.menu}>
        {MENU.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + '/')
          if (m.soon) {
            return (
              <div key={m.label} style={{ ...s.soonRow, color: dark ? '#4b5563' : '#9ca3af' }} title="곧 제공됩니다">
                <span style={s.icon}>{m.icon}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
                <span style={{ ...s.soonBadge, background: dark ? '#1f2937' : '#F3F4F6', color: dark ? '#4b5563' : '#9ca3af' }}>준비중</span>
              </div>
            )
          }
          return (
            <Link
              key={m.label}
              href={m.href}
              style={{
                ...s.row,
                background: active ? activeBg : 'transparent',
                color: active ? activeColor : textColor,
                fontWeight: active ? 700 : 500,
              }}
            >
              <span style={s.icon}>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          )
        })}
      </div>

      <div style={{ ...s.bottom, borderTop: `1px solid ${navBorder}` }}>
        <button
          onClick={toggleTheme}
          style={{
            ...s.themeBtn,
            background: dark ? '#1f2937' : '#f3f4f6',
            color: dark ? '#9ca3af' : '#6b7280',
            border: `1px solid ${navBorder}`,
          }}
        >
          {dark ? '☀️ 라이트 모드' : '🌙 다크 모드'}
        </button>
        <button onClick={handleSignOut} style={{ ...s.signOutBtn, color: dark ? '#f87171' : '#ef4444' }}>
          <span style={s.icon}>🚪</span>
          <span>로그아웃</span>
        </button>
      </div>
    </nav>
  )
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    width: 220,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '20px 16px 16px',
  },
  logoText: { fontSize: 15, fontWeight: 800 },
  menu: { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    fontSize: 13,
    transition: 'background 0.15s',
  },
  icon: { width: 20, textAlign: 'center' as const },
  soonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  soonBadge: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 4,
    marginLeft: 4,
  },
  bottom: {
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  themeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 4,
  },
  signOutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  },
}
