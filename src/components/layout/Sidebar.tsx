'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { createSupabaseBrowser } from '@/lib/supabase-browser'

type NavItem = { label: string; href: string }
type NavSection = { label: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: '대시보드', href: '/dashboard' },
      { label: '매출분석', href: '/analytics' },
      { label: '원장관리', href: '/ledger' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: '거래처', href: '/customers' },
      { label: '주문', href: '/orders' },
      { label: '견적', href: '/quotes' },
      { label: '발주요청', href: '/rfq' },
      { label: '상품', href: '/products' },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: '수금', href: '/payments' },
      { label: '수금 등록', href: '/payments/new' },
      { label: '지급', href: '/disbursements' },
      { label: '지급 등록', href: '/disbursements/new' },
      { label: '매입', href: '/purchases' },
      { label: '자금', href: '/funds' },
    ],
  },
  {
    label: 'Settings',
    items: [{ label: '설정', href: '/settings' }],
  },
]

function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (pathname.startsWith(href + '/')) return true
  return false
}

function SidebarInner({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [hoverHref, setHoverHref] = useState<string | null>(null)

  const flat = useMemo(() => SECTIONS.flatMap((s) => s.items), [])
  const activeHref = useMemo(() => {
    const exact = flat.find((i) => i.href === pathname)?.href
    if (exact) return exact
    const prefix = flat.find((i) => pathname.startsWith(i.href + '/'))?.href
    return prefix ?? null
  }, [flat, pathname])

  async function logout() {
    try {
      const supabase = createSupabaseBrowser()
      await supabase.auth.signOut()
    } finally {
      router.replace('/login')
      onNavigate?.()
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.brand}>
        <span style={s.brandAccent} />
        <div style={s.brandText}>식식이OS</div>
      </div>

      <div style={s.nav}>
        {SECTIONS.map((sec) => (
          <div key={sec.label} style={s.section}>
            <div style={s.sectionLabel}>{sec.label}</div>
            <div style={s.sectionItems}>
              {sec.items.map((it) => {
                const active = activeHref ? activeHref === it.href || isActivePath(pathname, it.href) : false
                const hovered = hoverHref === it.href
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => onNavigate?.()}
                    onMouseEnter={() => setHoverHref(it.href)}
                    onMouseLeave={() => setHoverHref((prev) => (prev === it.href ? null : prev))}
                    style={{
                      ...s.item,
                      background: active
                        ? 'var(--color-primary)'
                        : hovered
                          ? 'rgba(255,255,255,0.08)'
                          : 'transparent',
                      color: active ? '#ffffff' : 'var(--color-bg)',
                    }}
                  >
                    {it.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={s.footer}>
        <button type="button" onClick={logout} style={s.logoutBtn}>
          로그아웃
        </button>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      <nav style={{ ...s.desktopNav, display: isMobile ? 'none' : 'flex' }}>
        <SidebarInner />
      </nav>

      <button
        type="button"
        style={{ ...s.hamburger, display: isMobile ? 'flex' : 'none' }}
        onClick={() => setMobileOpen(true)}
        aria-label="메뉴 열기"
      >
        <span style={s.hamburgerLine} />
        <span style={s.hamburgerLine} />
        <span style={s.hamburgerLine} />
      </button>

      {mobileOpen && (
        <div
          style={s.dim}
          onClick={() => setMobileOpen(false)}
          onMouseDown={(e) => e.preventDefault()}
        />
      )}

      <nav
        style={{
          ...s.mobileNav,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div style={s.mobileHeader}>
          <button type="button" style={s.closeBtn} onClick={() => setMobileOpen(false)}>
            ✕
          </button>
        </div>
        <SidebarInner onNavigate={() => setMobileOpen(false)} />
      </nav>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  desktopNav: {
    width: 200,
    minHeight: '100vh',
    background: 'var(--color-text)',
    color: 'var(--color-bg)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: '100vh',
    background: 'var(--color-text)',
    color: 'var(--color-bg)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '18px 16px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
  },
  brandAccent: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: 'var(--color-primary)',
    boxShadow: '0 0 0 3px rgba(31,93,58,0.18)',
    flexShrink: 0,
  },
  brandText: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '-0.2px',
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: 700,
    letterSpacing: '0.2px',
    padding: '0 6px',
    textTransform: 'uppercase',
  },
  sectionItems: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: {
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-bg)',
    textDecoration: 'none',
    transition: 'background 120ms ease',
  },
  footer: {
    padding: 10,
    borderTop: '1px solid rgba(255,255,255,0.10)',
  },
  logoutBtn: {
    width: '100%',
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--color-bg)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },

  hamburger: {
    display: 'none',
    flexDirection: 'column',
    gap: 5,
    padding: 12,
    background: 'rgba(43,43,43,0.90)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    cursor: 'pointer',
    position: 'fixed' as const,
    top: 12,
    left: 12,
    zIndex: 200,
  },
  hamburgerLine: {
    display: 'block',
    width: 18,
    height: 2,
    background: 'var(--color-bg)',
    borderRadius: 2,
  },
  dim: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300 },
  mobileNav: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    background: 'var(--color-text)',
    zIndex: 400,
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.22s ease',
    overflowY: 'auto',
  },
  mobileHeader: { display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' },
  closeBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    fontSize: 14,
    cursor: 'pointer',
    color: 'var(--color-bg)',
    padding: '8px 10px',
  },
}
