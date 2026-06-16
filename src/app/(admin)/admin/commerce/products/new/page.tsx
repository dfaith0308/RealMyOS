import Link from 'next/link'
import ListingNewClient from '@/components/commerce/ListingNewClient'
import s from '../../../../admin-shared.module.css'

export default function AdminCommerceProductNewPage() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '20px 24px 96px' }}>
      <ListingNewClient />
    </main>
  )
}
