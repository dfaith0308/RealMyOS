import { redirect } from 'next/navigation'

export default function QuoteDetailLegacyRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/quotes/${params.id}`)
}
