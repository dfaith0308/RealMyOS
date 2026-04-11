import { getQuotes } from '@/actions/quote'
import QuoteListClient from './QuoteListClient'

export default async function QuotesPage() {
  const result = await getQuotes()
  return <QuoteListClient initialQuotes={result.data ?? []} />
}
