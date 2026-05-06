import { getQuoteDetail } from '@/actions/quote'
import QuoteDetailClient from '../../orders/quotes/QuoteDetailClient'
import { notFound } from 'next/navigation'

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const [detail] = await Promise.all([getQuoteDetail(params.id)])
  if (!detail.success || !detail.data) return notFound()
  return <QuoteDetailClient quote={detail.data} />
}

