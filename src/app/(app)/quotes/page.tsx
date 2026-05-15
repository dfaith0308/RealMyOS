import { getQuotes } from '@/actions/quote'
import QuoteListClient from '../orders/quotes/QuoteListClient'

export default async function QuotesPage() {
  const result = await getQuotes()
  return <QuoteListClient initialQuotes={result.data ?? []} />
}

