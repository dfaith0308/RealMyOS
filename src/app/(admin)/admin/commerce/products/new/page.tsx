import ListingFormClient from '@/components/commerce/ListingFormClient'
import s from '../../../../admin-shared.module.css'

export default function AdminCommerceProductNewPage() {
  return (
    <main className={s.main} style={{ maxWidth: 1600, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '20px 32px 96px' }}>
      <ListingFormClient mode="new" />
    </main>
  )
}
