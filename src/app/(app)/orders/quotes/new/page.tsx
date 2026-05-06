import { redirect } from 'next/navigation'

export default function NewQuoteLegacyRedirectPage() {
  redirect('/quotes/new')
}
