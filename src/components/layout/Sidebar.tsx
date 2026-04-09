'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface MenuItem {
  label:    string
  href?:    string
  soon?:    boolean
}

interface MenuGroup {
  label:    string
  icon:     string
  href?:    string       // 대메뉴 클릭 시 이동
  items?:   MenuItem[]   // 중메뉴
}

const MENU: MenuGroup[] = [
  {
    label: '대시보드',
    icon:  '📊',
    href:  '/dashboard',
  },
  {
    label: '거래처관리',
    icon:  '🏪',
    href:  '/customers',
    items: [
      { label: '거래처 목록', href: '/customers' },
      { label: '거래처 등록', href: '/customers/new' },
    ],
  },
  {
    label: '주문관리',
    icon:  '📋',
    href:  '/orders',
    items: [
      { label: '주문 목록', href: '/orders' },
      { label: '주문 등록', href: '/orders/new' },
    ],
  },
  {
    label: '상품관리',
    icon:  '📦',
    href:  '/products',
    items: [
      { label: '상품 목록',  href: '/products' },
      { label: '상품 등록',  href: '/products/new' },
      { label: '대량 등록',  href: '/products/bulk' },
    ],
  },
  {
    label: '수금관리',
    icon:  '💰',
    href:  '/payments/new',
    items: [
      { label: '수금 등록', href: '/payments/new' },
      { label: '수금 목록', soon: true },
    ],
  },
  {
    label: '자금관리',
    icon:  '🏦',
    href:  '/funds',
    items: [
      { label: '자금 현황', href: '/funds' },
      { label: '자금 설정', href: '/funds/settings' },
    ],
  },
  {
    label: '설정',
    icon:  '⚙️',
    href:  '/settings',
  },
  // 준비중
  { label: '견적관리',    icon: '📄', soon: true },
  { label: '매입관리',    icon: '🚚', soon: true },
  { label: '원장관리',    icon: '📒', soon: true },
  { label: '매출분석',    icon: '📈', soon: true },
  { label: '자동화영업',  icon: '🤖', soon: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // 현재 경로에 해당하는 대메뉴 자동 열기
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

  function isActive(href: string) {
    // 정확한 경로 매칭 (중메뉴)
    if (pathname === href) return true
    // 서브 경로 매칭 (단, /customers/new가 /customers를 active로 만들지 않음)
    if (href !== '/customers/new' && href !== '/orders/new' &&
        href !== '/products/new' && href !== '/products/bulk' &&
        href !== '/payments/new' && href !== '/customers/all')
      return pathname.startsWith(href + '/')
    return false
  }

  return (
    <nav style={s.nav}>
      {/* 로고 */}
      <div style={s.logo}>
        <span style={s.logoIcon}>🥬</span>
        <span style={s.logoText}>식식이 OS</span>
      </div>

      {/* 메뉴 */}
      <div style={s.menuList}>
        {MENU.map((group) => {
          const isOpen    = openGroups.has(group.label)
          const hasItems  = !!group.items?.length
          const groupActive = group.href ? isActive(group.href)
            : group.items?.some((i) => i.href && isActive(i.href))

          // 준비중 대메뉴
          if (group.soon) return (
            <div key={group.label} style={s.soonGroup} title="곧 제공됩니다">
              <span>{group.icon}</span>
              <span style={s.soonLabel}>{group.label}</span>
              <span style={s.soonBadge}>준비중</span>
            </div>
          )

          return (
            <div key={group.label}>
              {/* 대메뉴 */}
              <div
                style={{
                  ...s.groupRow,
                  background: groupActive && !hasItems ? 'var(--color-primary-light)' : 'transparent',
                  color:      groupActive && !hasItems ? 'var(--color-primary)' : '#374151',
                  fontWeight: groupActive && !hasItems ? 600 : 400,
                  cursor:     'pointer',
                }}
                onClick={() => {
                  if (hasItems) toggleGroup(group.label)
                }}>
                <Link
                  href={group.href ?? '#'}
                  style={{ ...s.groupLink, color: 'inherit', fontWeight: 'inherit' }}
                  onClick={(e) => hasItems && e.preventDefault()}>
                  <span style={s.groupIcon}>{group.icon}</span>
                  <span>{group.label}</span>
                </Link>
                {hasItems && (
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                )}
              </div>

              {/* 중메뉴 */}
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
    </nav>
  )
}

const s: Record<string, React.CSSProperties> = {
  nav:        { width: 220, minHeight: '100vh', background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  logo:       { display: 'flex', alignItems: 'center', gap: 8, padding: '20px 16px 16px', borderBottom: '1px solid #f3f4f6' },
  logoIcon:   { fontSize: 22 },
  logoText:   { fontSize: 15, fontWeight: 700, color: 'var(--color-primary)' },
  menuList:   { flex: 1, padding: '8px 0', overflowY: 'auto' },
  groupRow:   { display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, margin: '1px 8px', transition: 'background 0.1s' },
  groupLink:  { display: 'flex', alignItems: 'center', gap: 8, flex: 1, textDecoration: 'none', fontSize: 13 },
  groupIcon:  { fontSize: 15, width: 20, textAlign: 'center' },
  subList:    { paddingLeft: 36, paddingBottom: 4 },
  subItem:    { display: 'block', padding: '6px 12px', borderRadius: 6, fontSize: 12, textDecoration: 'none', margin: '1px 8px 1px 0', transition: 'background 0.1s' },
  soonGroup:  { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '1px 8px', borderRadius: 8, cursor: 'not-allowed', opacity: 0.45, fontSize: 13, color: '#9ca3af' },
  soonItem:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'not-allowed', color: '#9ca3af', margin: '1px 8px 1px 0' },
  soonLabel:  { flex: 1 },
  soonBadge:  { fontSize: 9, padding: '1px 5px', background: '#F3F4F6', color: '#9ca3af', borderRadius: 4, marginLeft: 4 },
}
