'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

type MenuItem = {
  label: string
  href: string
}

type MenuEntry =
  | { type: 'link'; label: string; icon: string; href: string }
  | { type: 'group'; label: string; icon: string; children: MenuItem[] }

const MENU: MenuEntry[] = [
  { type: 'link', label: '대시보드', icon: '🧭', href: '/admin/dashboard' },
  { type: 'link', label: '거래관제', icon: '🧬', href: '/admin/trades' },
  { type: 'link', label: '참여자', icon: '🧠', href: '/admin/participants' },
  { type: 'link', label: '학습센터', icon: '🧪', href: '/admin/learning' },
  { type: 'link', label: '분석엔진', icon: '🧷', href: '/admin/engine' },
  { type: 'link', label: '성장/영업 엔진', icon: '🚀', href: '/admin/growth' },
  {
    type: 'group',
    label: '영업 관리',
    icon: '📇',
    children: [
      { label: '리드 관리', href: '/admin/sales' },
      { label: '프로모션 코드', href: '/admin/sales/promo' },
    ],
  },
  { type: 'link', label: '테넌트관리', icon: '🏢', href: '/admin/tenants' },
  {
    type: 'group',
    label: '쇼핑몰관리',
    icon: '🛒',
    children: [
      { label: '상품관리', href: '/admin/commerce/products' },
      { label: '카테고리', href: '/admin/commerce/categories' },
      { label: '주문처리', href: '/admin/commerce/orders' },
      { label: '가격 정책', href: '/admin/commerce/pricing' },
      { label: '무통장 입금', href: '/admin/commerce/storefront-bank' },
      { label: '쿠폰 관리', href: '/admin/coupons' },
      { label: '푸시 알림', href: '/admin/push' },
    ],
  },
  {
    type: 'group',
    label: '수익/정산 통제',
    icon: '💹',
    children: [
      { label: '정산 현황', href: '/admin/settlements' },
      { label: '지급 예정', href: '/admin/commerce/allocations' },
      { label: '공급자 지급 원장', href: '/admin/commerce/payables' },
    ],
  },
  { type: 'link', label: '정책/실험 콘솔', icon: '⚙️', href: '/admin/policy' },
  { type: 'link', label: '로그', icon: '🧾', href: '/admin/logs' },
]

const STORAGE_KEY = 'admin-theme'

function isGroupActive(children: MenuItem[], pathname: string) {
  return children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const isDark = saved === 'dark'
    setDark(isDark)
    document.documentElement.setAttribute('data-admin-theme', isDark ? 'dark' : 'light')

    // 현재 경로에 해당하는 그룹 자동 펼침
    const autoOpen: Record<string, boolean> = {}
    for (const entry of MENU) {
      if (entry.type === 'group' && isGroupActive(entry.children, pathname)) {
        autoOpen[entry.label] = true
      }
    }
    setOpenGroups(autoOpen)
  }, [pathname])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    const val = next ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, val)
    document.documentElement.setAttribute('data-admin-theme', val)
  }

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navBg = dark ? '#111827' : '#ffffff'
  const navBorder = dark ? '#1f2937' : '#e5e7eb'
  const textColor = dark ? '#e8e8e8' : '#374151'
  const mutedColor = dark ? '#6b7280' : '#9ca3af'
  const activeColor = dark ? '#4ade80' : 'var(--color-primary)'
  const activeBg = dark ? 'rgba(74,222,128,0.1)' : 'var(--color-primary-light)'
  const subBg = dark ? '#1f2937' : '#f9fafb'

  return (
    <nav style={{ ...s.nav, background: navBg, borderRight: `1px solid ${navBorder}` }}>
      <div style={{ ...s.logo, borderBottom: `1px solid ${navBorder}` }}>
        <span style={{ fontSize: 22 }}>🛡️</span>
        <span style={{ ...s.logoText, color: activeColor }}>관리자 OS</span>
      </div>

      <div style={s.menu}>
        {MENU.map((entry) => {
          if (entry.type === 'link') {
            const active = pathname === entry.href || pathname.startsWith(entry.href + '/')
            return (
              <Link
                key={entry.label}
                href={entry.href}
                style={{
                  ...s.row,
                  background: active ? activeBg : 'transparent',
                  color: active ? activeColor : textColor,
                  fontWeight: active ? 700 : 500,
                }}
              >
                <span style={s.icon}>{entry.icon}</span>
                <span>{entry.label}</span>
              </Link>
            )
          }

          if (entry.type === 'group') {
            const groupActive = isGroupActive(entry.children, pathname)
            const open = openGroups[entry.label] ?? false

            return (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  style={{
                    ...s.row,
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    background: groupActive && !open ? activeBg : 'transparent',
                    color: groupActive ? activeColor : textColor,
                    fontWeight: groupActive ? 700 : 500,
                    fontFamily: 'inherit',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={s.icon}>{entry.icon}</span>
                    <span>{entry.label}</span>
                  </div>
                  <span style={{ fontSize: 10, color: mutedColor, marginRight: 4 }}>
                    {open ? '▲' : '▼'}
                  </span>
                </button>

                {open && (
                  <div style={{ background: subBg, borderRadius: 8, margin: '2px 4px 4px', overflow: 'hidden' }}>
                    {entry.children.map(child => {
                      const childActive = pathname === child.href || pathname.startsWith(child.href + '/')
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 12px 8px 20px',
                            textDecoration: 'none',
                            fontSize: 12,
                            color: childActive ? activeColor : textColor,
                            fontWeight: childActive ? 700 : 400,
                            background: childActive ? activeBg : 'transparent',
                          }}
                        >
                          <span style={{ marginRight: 6, color: mutedColor, fontSize: 10 }}>•</span>
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return null
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
  menu: { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' },
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
