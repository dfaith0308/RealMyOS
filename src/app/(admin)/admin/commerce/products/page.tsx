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
          <p className={s.subtitle}>
            상품을 등록하고 노출 상태·가격·이미지를 관리합니다
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/commerce/products/new" className={s.primaryBtn}>
            + 상품 등록
          </Link>
          <Link
            href="/admin/commerce/products/bulk"
            style={{
              padding: '8px 14px',
              border: '1px solid #1f5d3a',
              borderRadius: 8,
              background: '#fff',
              color: '#1f5d3a',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            📋 대량 등록
          </Link>
          <a
            href="/api/admin/export-listings"
            download
            style={{
              padding: '8px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              background: '#fff',
              color: '#374151',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            📥 엑셀 다운로드
          </a>
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
