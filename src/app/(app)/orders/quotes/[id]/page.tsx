import { getQuoteDetail } from '@/actions/quote'
import { getProductsForOrder } from '@/actions/order'
import QuoteDetailClient from '../QuoteDetailClient'
import { notFound } from 'next/navigation'

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const [detail] = await Promise.all([getQuoteDetail(params.id)])
  if (!detail.success || !detail.data) return notFound()
  return <QuoteDetailClient quote={detail.data} />
}
