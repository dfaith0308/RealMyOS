import { getTopCustomersForContact, getSalesScripts } from '@/actions/sales'
import SalesExecClient from './SalesExecClient'

export const metadata = { title: '실행센터 — RealMyOS' }

export default async function SalesExecPage() {
  const [topRes, scriptsRes] = await Promise.all([
    getTopCustomersForContact(3),
    getSalesScripts(),
  ])

  return (
    <SalesExecClient
      top={topRes.data ?? []}
      scripts={scriptsRes.data ?? []}
    />
  )
}

