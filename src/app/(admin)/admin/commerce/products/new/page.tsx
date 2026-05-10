import Link from 'next/link'
import ListingNewClient from '@/components/commerce/ListingNewClient'
import s from '../../../../admin-shared.module.css'

export default function AdminCommerceProductNewPage() {
  return (
    <main className={s.main} style={{ maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>상품 등록</h1>
          <p className={s.subtitle}>
            플랫폼 커머스 전용 상품·Listing을 한 번에 등록합니다. (products + commerce_product_listings)
          </p>
        </div>
        <Link href="/admin/commerce/products" className={s.ghostBtn}>
          목록으로
        </Link>
      </header>
      <ListingNewClient />
    </main>
  )
}
