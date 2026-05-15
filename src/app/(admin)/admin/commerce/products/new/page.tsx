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
            쇼핑몰에 보일 카드와 상세 페이지를 만들고 한 번에 저장합니다.
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
