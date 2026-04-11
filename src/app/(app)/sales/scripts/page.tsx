import { getSalesScripts } from '@/actions/sales'
import SalesScriptsClient from './SalesScriptsClient'

export default async function SalesScriptsPage() {
  const result = await getSalesScripts()
  return <SalesScriptsClient initialScripts={result.data ?? []} />
}
