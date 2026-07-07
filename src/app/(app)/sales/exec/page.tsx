import { getTopCustomersForContact, getSalesScripts } from '@/actions/sales'
import { getCustomerList } from '@/actions/customer-query'
import SalesExecClient from './SalesExecClient'

export const metadata = { title: '실행센터 — RealMyOS' }

export default async function SalesExecPage() {
  const [topRes, scriptsRes, safeRes] = await Promise.all([
    getTopCustomersForContact(3),
    getSalesScripts(),
    getCustomerList({ safe_number: true }),
  ])

  const safeCustomers = (safeRes.data ?? [])
    .filter((c) => (c.phone ?? '').trim())
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone!,
    }))

  return (
    <SalesExecClient
      top={topRes.data ?? []}
      scripts={scriptsRes.data ?? []}
      safeCustomers={safeCustomers}
    />
  )
}
