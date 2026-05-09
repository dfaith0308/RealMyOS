import Link from 'next/link'
import { getListings } from '@/actions/admin/commerce'
import ListingsClient from '@/components/commerce/ListingsClient'
import s from '../../../admin-shared.module.css'

type StatusFilter = 'all' | 'draft' | 'visible' | 'hidden' | 'sold_out' | 'discontinued'

export default async function AdminCommerceProductsPage(props: {
  searchParams?: Promise<{ status?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const raw = Array.isArray(searchParams?.status) ? searchParams?.status?.[0] : searchParams?.status
  const statusFilter: StatusFilter =
    raw === 'draft' ||
    raw === 'visible' ||
    raw === 'hidden' ||
    raw === 'sold_out' ||
    raw === 'discontinued' ||
    raw === 'all'
      ? raw
      : 'all'

  const res = await getListings(statusFilter === 'all' ? {} : { status: statusFilter })

  if (!res.success) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>상품 관리</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {res.error}
        </p>
      </main>
    )
  }

  const listings = res.data?.listings ?? []

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>상품 관리</h1>
          <p className={s.subtitle}>플랫폼 Listing 노출·상태·가격 관리 (COMMERCE-FLOW 준수)</p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/dashboard" className={s.ghostBtn}>
            대시보드
          </Link>
        </div>
      </header>

      <nav className={s.actionsRow} style={{ flexWrap: 'wrap' }}>
        {(
          [
            ['all', '전체'],
            ['draft', '초안'],
            ['visible', '노출'],
            ['hidden', '숨김'],
            ['sold_out', '품절'],
            ['discontinued', '판매중단'],
          ] as const
        ).map(([key, label]) => (
          <FilterTab key={key} href={`/admin/commerce/products?status=${key}`} active={statusFilter === key} label={label} />
        ))}
      </nav>

      <ListingsClient listings={listings} statusFilter={statusFilter} />
    </main>
  )
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={active ? s.primaryBtn : s.ghostBtn}
      style={{ fontSize: 12, padding: '6px 12px' }}
    >
      {label}
    </Link>
  )
}
