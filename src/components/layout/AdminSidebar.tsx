'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  { label: '스토어 무통장', icon: '🏦', href: '/admin/commerce/storefront-bank' },
  { label: '로그', icon: '🧾', href: '/admin/logs' },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <nav style={s.nav}>
      <div style={s.logo}>
        <span style={{ fontSize: 22 }}>🛡️</span>
        <span style={s.logoText}>관리자 OS</span>
      </div>

      <div style={s.menu}>
        {MENU.map((m) => {
          const active = pathname === m.href || pathname.startsWith(m.href + '/')
          if (m.soon) {
            return (
              <div key={m.label} style={s.soonRow} title="곧 제공됩니다">
                <span style={s.icon}>{m.icon}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
                <span style={s.soonBadge}>준비중</span>
              </div>
            )
          }

          return (
            <Link
              key={m.label}
              href={m.href}
              style={{
                ...s.row,
                background: active ? 'var(--color-primary-light)' : 'transparent',
                color: active ? 'var(--color-primary)' : '#374151',
                fontWeight: active ? 700 : 500,
              }}
            >
              <span style={s.icon}>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    width: 220,
    minHeight: '100vh',
    background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '20px 16px 16px',
    borderBottom: '1px solid #f3f4f6',
  },
  logoText: { fontSize: 15, fontWeight: 800, color: 'var(--color-primary)' },
  menu: { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    fontSize: 13,
  },
  icon: { width: 20, textAlign: 'center' as const },
  soonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 13,
    color: '#9ca3af',
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  soonBadge: {
    fontSize: 9,
    padding: '1px 5px',
    background: '#F3F4F6',
    color: '#9ca3af',
    borderRadius: 4,
    marginLeft: 4,
  },
}

