import { getSalesHistory } from '@/actions/sales'
import SalesHistoryClient from './SalesHistoryClient'

export default async function SalesHistoryPage() {
  const result = await getSalesHistory()
  return <SalesHistoryClient initialHistory={result.data ?? []} />
}
