'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

interface MenuItem {
  label: string
  href?: string
  soon?: boolean
}

interface MenuGroup {
  label:  string
  icon:   string
  href?:  string
  items?: MenuItem[]
  soon?:  boolean
}

const MENU: MenuGroup[] = [
  { label: '대시보드', icon: '📊', href: '/dashboard' },
  {
    label: '거래처관리', icon: '🏪', href: '/customers',
    items: [
      { label: '거래처 목록', href: '/customers' },
      { label: '거래처 등록', href: '/customers/new' },
    ],
  },
  {
    label: '주문관리', icon: '📋', href: '/orders',
    items: [
      { label: '주문 목록', href: '/orders' },
      { label: '주문 등록', href: '/orders/new' },
      { label: '견적관리',  href: '/orders/quotes' },
    ],
  },
  {
    label: '상품관리', icon: '📦', href: '/products',
    items: [
      { label: '상품 목록', href: '/products' },
      { label: '상품 등록', href: '/products/new' },
      { label: '대량 등록', href: '/products/bulk' },
    ],
  },
  {
    label: '수금관리', icon: '💰', href: '/payments/new',
    items: [
      { label: '수금 등록', href: '/payments/new' },
      { label: '수금 목록', href: '/payments' },
    ],
  },
  {
    label: '자금관리', icon: '🏦', href: '/funds',
    items: [
      { label: '자금 현황', href: '/funds' },
      { label: '자금 설정', href: '/funds/settings' },
    ],
  },
  { label: '설정', icon: '⚙️', href: '/settings' },

  { label: '매입관리',   icon: '🚚', soon: true },
  { label: '원장관리',   icon: '📒', soon: true },
  {
    label: '자동화영업', icon: '🎯', href: '/sales/schedule',
    items: [
      { label: '영업스케쥴', href: '/sales/schedule' },
      { label: '영업이력',   href: '/sales/history' },
      { label: '스크립트관', href: '/sales/scripts' },
    ],
  },
  { label: '매출분석',   icon: '📈', soon: true },

]

// ── 사이드바 내용 (데스크탑/모바일 공용) ─────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname  = usePathname()
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const open = new Set<string>()
    for (const g of MENU) {
      if (g.items?.some((i) => i.href && pathname.startsWith(i.href)))
        open.add(g.label)
    }
    return open
  })

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  // 그룹 내 중메뉴 href 전체 목록 — 정확 매칭에서 제외할 경로
  const allItemHrefs = new Set(
    MENU.flatMap((g) => g.items?.map((i) => i.href).filter(Boolean) ?? [])
  )

  function isActive(href: string) {
    // 1. 정확히 일치하면 active
    if (pathname === href) return true
    // 2. 하위 경로일 때: 해당 경로가 다른 중메뉴와 정확히 겹치지 않아야 active
    //    예: /customers/[id] → /customers active O
    //        /customers/new  → /customers active X (new가 별도 중메뉴이므로)
    if (pathname.startsWith(href + '/')) {
      // pathname이 다른 중메뉴 href와 정확히 일치하면 active 양보
      if (allItemHrefs.has(pathname)) return false
      return true
    }
    return false
  }

  return (
    <>
      {/* 로고 */}
      <div style={s.logo}>
        <span style={{ fontSize: 22 }}>🥬</span>
        <span style={s.logoText}>식식이 OS</span>
      </div>

      {/* 메뉴 */}
      <div style={s.menuList}>
        {MENU.map((group) => {
          const isOpen    = openGroups.has(group.label)
          const hasItems  = !!group.items?.length
          const groupActive = group.href
            ? isActive(group.href)
            : group.items?.some((i) => i.href && isActive(i.href))

          if (group.soon) return (
            <div key={group.label} style={s.soonGroup} title="곧 제공됩니다">
              <span>{group.icon}</span>
              <span style={{ flex: 1 }}>{group.label}</span>
              <span style={s.soonBadge}>준비중</span>
            </div>
          )

          return (
            <div key={group.label}>
              <div
                style={{
                  ...s.groupRow,
                  background: groupActive && !hasItems ? 'var(--color-primary-light)' : 'transparent',
                  color:      groupActive && !hasItems ? 'var(--color-primary)' : '#374151',
                  fontWeight: groupActive && !hasItems ? 600 : 400,
                }}
                onClick={() => { if (hasItems) toggleGroup(group.label) }}>
                <Link
                  href={group.href ?? '#'}
                  style={{ ...s.groupLink, color: 'inherit', fontWeight: 'inherit' }}
                  onClick={(e) => {
                    if (hasItems) e.preventDefault()
                    else onNavigate?.()
                  }}>
                  <span style={s.groupIcon}>{group.icon}</span>
                  <span>{group.label}</span>
                </Link>
                {hasItems && (
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {hasItems && isOpen && (
                <div style={s.subList}>
                  {group.items!.map((item) => {
                    if (item.soon) return (
                      <div key={item.label} style={s.soonItem} title="곧 제공됩니다">
                        {item.label}
                        <span style={s.soonBadge}>준비중</span>
                      </div>
                    )
                    const active = isActive(item.href!)
                    return (
                      <Link key={item.label} href={item.href!}
                        onClick={() => onNavigate?.()}
                        style={{
                          ...s.subItem,
                          background: active ? 'var(--color-primary-light)' : 'transparent',
                          color:      active ? 'var(--color-primary)' : '#6b7280',
                          fontWeight: active ? 600 : 400,
                        }}>
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
    </>
  )
}

// ── 메인 Sidebar 컴포넌트 ─────────────────────────────────────

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile]     = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)

    const handleMQ = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // 데스크탑 전환 시 모바일 사이드바 닫기 + scroll lock 해제
      if (!e.matches) {
        setMobileOpen(false)
        document.body.style.overflow = ''
      }
    }
    mq.addEventListener('change', handleMQ)
    return () => mq.removeEventListener('change', handleMQ)
  }, [])

  // 라우트 변경 시 모바일 사이드바 닫기
  const pathname = usePathname()
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // 스크롤 잠금 — 닫힐 때 반드시 원복
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }  // unmount 시에도 해제
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
      {/* 데스크탑 사이드바 */}
      <nav style={{ ...s.desktopNav, display: isMobile ? 'none' : 'flex' }}>
        <SidebarContent />
      </nav>

      {/* 모바일 햄버거 버튼 */}
      <button
        style={{ ...s.hamburger, display: isMobile ? 'flex' : 'none' }}
        onClick={() => setMobileOpen(true)}
        aria-label="메뉴 열기">
        <span style={s.hamburgerLine} />
        <span style={s.hamburgerLine} />
        <span style={s.hamburgerLine} />
      </button>

      {/* 모바일 dim 배경 */}
      {mobileOpen && (
        <div style={s.dim}
          onClick={() => setMobileOpen(false)}
          onMouseDown={(e) => e.preventDefault()} />
      )}

      {/* 모바일 사이드바 */}
      <nav style={{
        ...s.mobileNav,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
      }}>
        <div style={s.mobileHeader}>
          <button style={s.closeBtn} onClick={() => setMobileOpen(false)}>✕</button>
        </div>
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </nav>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  // 데스크탑
  desktopNav:  {
    width: 220, minHeight: '100vh', background: '#fff',
    borderRight: '1px solid #e5e7eb', display: 'flex',
    flexDirection: 'column', flexShrink: 0,
    // 모바일에서 숨김은 globals.css에서 처리
  },
  logo:        { display: 'flex', alignItems: 'center', gap: 8, padding: '20px 16px 16px', borderBottom: '1px solid #f3f4f6' },
  logoText:    { fontSize: 15, fontWeight: 700, color: 'var(--color-primary)' },
  menuList:    { flex: 1, padding: '8px 0', overflowY: 'auto' },
  groupRow:    { display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, margin: '1px 8px', cursor: 'pointer' },
  groupLink:   { display: 'flex', alignItems: 'center', gap: 8, flex: 1, textDecoration: 'none', fontSize: 13 },
  groupIcon:   { fontSize: 15, width: 20, textAlign: 'center' as const },
  subList:     { paddingLeft: 36, paddingBottom: 4 },
  subItem:     { display: 'block', padding: '6px 12px', borderRadius: 6, fontSize: 12, textDecoration: 'none', margin: '1px 8px 1px 0' },
  soonGroup:   { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '1px 8px', borderRadius: 8, cursor: 'not-allowed', opacity: 0.45, fontSize: 13, color: '#9ca3af' },
  soonItem:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', fontSize: 12, cursor: 'not-allowed', color: '#9ca3af', margin: '1px 8px 1px 0' },
  soonBadge:   { fontSize: 9, padding: '1px 5px', background: '#F3F4F6', color: '#9ca3af', borderRadius: 4, marginLeft: 4 },

  // 햄버거
  hamburger:     { display: 'none', flexDirection: 'column', gap: 5, padding: 12, background: 'none', border: 'none', cursor: 'pointer', position: 'fixed' as const, top: 12, left: 12, zIndex: 200 },
  hamburgerLine: { display: 'block', width: 22, height: 2, background: '#374151', borderRadius: 2 },

  // 모바일
  dim:         { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 },
  mobileNav:   {
    position: 'fixed' as const, top: 0, left: 0, bottom: 0,
    width: 260, background: '#fff', zIndex: 400,
    display: 'flex', flexDirection: 'column',
    transition: 'transform 0.25s ease',
    boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
    overflowY: 'auto',
  },
  mobileHeader:{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' },
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', padding: '4px 8px' },
}