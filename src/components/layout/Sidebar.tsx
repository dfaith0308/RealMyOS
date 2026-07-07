'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { createSupabaseBrowser } from '@/lib/supabase-browser'

interface MenuItem {
  label: string
  href?: string
  soon?: boolean
}

interface MenuGroup {
  label: string
  href?: string
  items?: MenuItem[]
  soon?: boolean
}

// 메뉴 구조는 이전 버전과 동일하게 유지 (그룹/서브메뉴 복원)
const MENU: MenuGroup[] = [
  { label: '대시보드', href: '/dashboard' },
  {
    label: '거래처관리', href: '/customers',
    items: [
      { label: '거래처 목록', href: '/customers' },
      { label: '거래처 등록', href: '/customers/new' },
    ],
  },
  {
    label: '주문관리', href: '/orders',
    items: [
      { label: '주문 목록', href: '/orders' },
      { label: '주문 등록', href: '/orders/new' },
    ],
  },
  {
    label: '견적관리', href: '/quotes',
    items: [
      { label: '견적목록', href: '/quotes' },
      { label: '견적등록', href: '/quotes/new' },
    ],
  },
  { label: '발주요청', href: '/rfq' },
  {
    label: '상품관리', href: '/products',
    items: [
      { label: '상품 목록', href: '/products' },
      { label: '상품 등록', href: '/products/new' },
      { label: '대량 등록', href: '/products/bulk' },
    ],
  },
  {
    label: '수금관리', href: '/payments/new',
    items: [
      { label: '수금 등록', href: '/payments/new' },
      { label: '수금 목록', href: '/payments' },
    ],
  },
  {
    label: '지급관리', href: '/disbursements',
    items: [
      { label: '지급 목록', href: '/disbursements' },
      { label: '지급 등록', href: '/disbursements/new' },
      { label: '지급 상세', soon: true },
    ],
  },
  {
    label: '매입관리', href: '/purchases',
    items: [
      { label: '매입 목록', href: '/purchases' },
      { label: '매입 등록', href: '/purchases/new' },
    ],
  },
  {
    label: '자금관리', href: '/funds',
    items: [
      { label: '자금 현황', href: '/funds' },
      { label: '자금 설정', href: '/funds/settings' },
    ],
  },
  {
    label: '설정', href: '/settings',
    items: [
      { label: '운영분류 관리', href: '/settings/tags' },
      { label: '메시지 템플릿', href: '/settings/messages' },
    ],
  },
  { label: '원장관리', href: '/ledger' },
  {
    label: '자동화영업', href: '/sales/schedule',
    items: [
      { label: '영업스케쥴', href: '/sales/schedule' },
      { label: '실행센터', href: '/sales/exec' },
      { label: '영업이력', href: '/sales/history' },
      { label: '스크립트관리', href: '/sales/scripts' },
    ],
  },
  { label: '매출분석', href: '/analytics' },
]

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [hoverSubKey, setHoverSubKey] = useState<string | null>(null)
  const [subStatus, setSubStatus] = useState<{ plan: string; plan_expires_at: string | null } | null>(null)

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const open = new Set<string>()
    for (const g of MENU) {
      if (g.items?.some((i) => i.href && pathname.startsWith(i.href))) open.add(g.label)
    }
    return open
  })

  // 그룹 내 중메뉴 href 전체 목록 — 정확 매칭에서 제외할 경로
  const allItemHrefs = useMemo(() => new Set(
    MENU.flatMap((g) => g.items?.map((i) => i.href).filter(Boolean) ?? []),
  ), [])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function isActive(href: string) {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) {
      if (allItemHrefs.has(pathname)) return false
      return true
    }
    return false
  }

  async function logout() {
    try {
      const supabase = createSupabaseBrowser()
      await supabase.auth.signOut()
    } finally {
      router.replace('/login')
      onNavigate?.()
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createSupabaseBrowser()
        const { data: { user } } = await supabase.auth.getUser()
        const tenantId = (user?.user_metadata as any)?.tenant_id as string | undefined
        if (!tenantId) return
        const { data } = await supabase
          .from('tenants')
          .select('subscription_plan, plan_expires_at')
          .eq('id', tenantId)
          .maybeSingle()
        if (cancelled) return
        if (data) {
          setSubStatus({
            plan: String((data as any).subscription_plan ?? 'free'),
            plan_expires_at: (data as any).plan_expires_at ?? null,
          })
        }
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [])

  function subLabel(plan: string) {
    if (plan === 'annual') return '연간'
    if (plan === 'monthly') return '월간'
    if (plan === 'earlybird') return '얼리버드'
    if (plan === 'pro') return '정식'
    return '무료'
  }

  return (
    <div style={s.wrap}>
      <Link
        href="/dashboard"
        style={s.brandLink}
        onClick={() => onNavigate?.()}
      >
        <span style={s.brandAccent} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={s.brandText}>식식이OS</div>
          {subStatus && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
              구독: {subLabel(subStatus.plan)}
              {subStatus.plan_expires_at ? ` · ~${new Date(subStatus.plan_expires_at).toLocaleDateString('ko-KR')}` : ''}
            </div>
          )}
        </div>
      </Link>

      <div style={s.menuList}>
        {MENU.map((group) => {
          const hasItems = !!group.items?.length
          const isOpen = openGroups.has(group.label)
          const groupActive = group.href
            ? isActive(group.href)
            : group.items?.some((i) => i.href && isActive(i.href))
          const hovered = hoverKey === group.label

          if (group.soon) {
            return (
              <div key={group.label} style={s.soonGroup} title="곧 제공됩니다">
                <span style={{ flex: 1 }}>{group.label}</span>
                <span style={s.soonBadge}>준비중</span>
              </div>
            )
          }

          return (
            <div key={group.label}>
              <div
                style={{
                  ...s.groupRow,
                  background: groupActive && !hasItems
                    ? 'rgba(255,255,255,0.15)'
                    : hovered
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  color: groupActive && !hasItems ? '#ffffff' : 'rgba(255,255,255,0.7)',
                }}
                onMouseEnter={() => setHoverKey(group.label)}
                onMouseLeave={() => setHoverKey((p) => (p === group.label ? null : p))}
                onClick={() => { if (hasItems) toggleGroup(group.label) }}
              >
                <Link
                  href={group.href ?? '#'}
                  style={{
                    ...s.groupLink,
                    color: 'inherit',
                    fontWeight: groupActive && !hasItems ? 500 : 600,
                  }}
                  onClick={(e) => {
                    if (hasItems && group.href !== '/sales/schedule') {
                      e.preventDefault()
                    } else {
                      onNavigate?.()
                    }
                  }}
                >
                  {group.label}
                </Link>
                {hasItems && (
                  <span style={s.caret}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                )}
              </div>

              {hasItems && isOpen && (
                <div style={s.subList}>
                  {group.items!.map((item) => {
                    if (item.soon) {
                      return (
                        <div key={item.label} style={s.soonItem} title="곧 제공됩니다">
                          {item.label}
                          <span style={s.soonBadge}>준비중</span>
                        </div>
                      )
                    }

                    const href = item.href!
                    const active = isActive(href)
                    const subHovered = hoverSubKey === href

                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => onNavigate?.()}
                        onMouseEnter={() => setHoverSubKey(href)}
                        onMouseLeave={() => setHoverSubKey((p) => (p === href ? null : p))}
                        style={{
                          ...s.subItem,
                          background: active
                            ? 'rgba(255,255,255,0.15)'
                            : subHovered
                              ? 'rgba(255,255,255,0.08)'
                              : 'transparent',
                          color: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
                          fontWeight: active ? 500 : 600,
                        }}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={s.footer}>
        <Link
          href="/subscribe"
          onClick={() => onNavigate?.()}
          style={{
            display: 'block',
            margin: '0 12px 8px',
            padding: '10px 16px',
            background: (subStatus?.plan ?? 'free') === 'free' ? '#E8701C' : '#1f5d3a',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {(subStatus?.plan ?? 'free') === 'free' ? '구독 시작하기' : '구독 관리'}
        </Link>
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

  // 라우트 변경 시 모바일 사이드바 닫기
  const pathname = usePathname()
  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // ESC 키로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
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
    background: '#1f5d3a',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: '100vh',
    background: '#1f5d3a',
    color: '#ffffff',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '18px 16px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
  },
  brandLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '18px 16px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    textDecoration: 'none',
    color: 'inherit',
    cursor: 'pointer',
  },
  brandAccent: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: '#ffffff',
    boxShadow: '0 0 0 3px rgba(255,255,255,0.18)',
    flexShrink: 0,
  },
  brandText: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '-0.2px',
    color: '#ffffff',
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  menuList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  groupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
  },
  groupLink: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  caret: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 0,
  },
  subList: {
    marginTop: 2,
    marginBottom: 8,
    paddingLeft: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  subItem: {
    display: 'block',
    padding: '7px 10px',
    borderRadius: 6,
    fontSize: 12,
    textDecoration: 'none',
  },
  soonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'not-allowed',
    opacity: 0.55,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  soonItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 10px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'not-allowed',
    color: 'rgba(255,255,255,0.5)',
  },
  soonBadge: {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.7)',
  },
  footer: {
    padding: 10,
    borderTop: '1px solid rgba(255,255,255,0.10)',
  },
  logoutBtn: {
    width: '100%',
    padding: '9px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },

  hamburger: {
    display: 'none',
    flexDirection: 'column',
    gap: 5,
    padding: 12,
    background: 'rgba(31,93,58,0.95)',
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
    background: '#ffffff',
    borderRadius: 2,
  },
  dim: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300 },
  mobileNav: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    background: '#1f5d3a',
    zIndex: 400,
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.22s ease',
    overflowY: 'auto',
  },
  mobileHeader: { display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0' },
  closeBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    fontSize: 14,
    cursor: 'pointer',
    color: '#ffffff',
    padding: '8px 10px',
  },
}
