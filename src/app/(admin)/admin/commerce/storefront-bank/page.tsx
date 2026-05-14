import Link from 'next/link'
import { getStorefrontBankTransferSettingsAdmin } from '@/actions/admin/storefront-bank-transfer'
import StorefrontBankTransferClient from '@/components/commerce/StorefrontBankTransferClient'
import s from '../../admin-shared.module.css'

export default async function AdminStorefrontBankPage() {
  const res = await getStorefrontBankTransferSettingsAdmin()
  if (!res.success) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>스토어 무통장 입금</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>{res.error}</p>
        <Link href="/admin/commerce/orders" className={s.ghostBtn}>
          주문 처리
        </Link>
      </main>
    )
  }

  return (
    <main className={s.main}>
      <StorefrontBankTransferClient initial={res.data?.parsed ?? null} />
    </main>
  )
}
