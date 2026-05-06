import { getCustomersForOrder } from '@/actions/order'
import QuoteCreateClient from '../../orders/quotes/QuoteCreateClient'

export default async function NewQuotePage() {
  const customers = await getCustomersForOrder()
  return <QuoteCreateClient initialCustomers={customers.data ?? []} />
}

