import { getQuoteDetail, getQuoteSentLogs } from '@/actions/quote'
import QuoteDetailClient from '../../orders/quotes/QuoteDetailClient'
import { notFound } from 'next/navigation'

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const [detail, sentLogs] = await Promise.all([getQuoteDetail(params.id), getQuoteSentLogs(params.id)])
  if (!detail.success || !detail.data) return notFound()
  return <QuoteDetailClient quote={detail.data} sentLogs={sentLogs.data ?? []} />
}

