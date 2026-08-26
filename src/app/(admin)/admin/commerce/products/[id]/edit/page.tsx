import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getListingForEdit, getShippingGroups } from '@/actions/admin/commerce'
import ListingFormClient from '@/components/commerce/ListingFormClient'
import s from '../../../../../admin-shared.module.css'

export default async function AdminCommerceProductEditPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const [lr, sr] = await Promise.all([getListingForEdit(id), getShippingGroups()])

  if (!lr.success || !lr.data) {
    const msg = lr.error ?? ''
    if (msg.includes('Listing 을 찾을 수 없습니다') || msg.includes('연결된 상품이 없습니다')) {
      notFound()
    }
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>상품 수정</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {msg || '조회에 실패했습니다'}
        </p>
        <Link href="/admin/commerce/products" className={s.ghostBtn}>
          목록으로
        </Link>
      </main>
    )
  }

  if (!sr.success || !sr.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>상품 수정</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>{sr.error}</p>
        <Link href="/admin/commerce/products" className={s.ghostBtn}>
          목록으로
        </Link>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 1600, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '20px 32px 96px' }}>
      <ListingFormClient
        mode="edit"
        initial={lr.data}
        shippingGroups={sr.data.groups}
      />
    </main>
  )
}
