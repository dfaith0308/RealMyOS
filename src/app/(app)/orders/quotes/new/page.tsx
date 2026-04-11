import { getCustomersForOrder, getProductsForOrder } from '@/actions/order'
import QuoteCreateClient from '../QuoteCreateClient'

export default async function NewQuotePage() {
  const customers = await getCustomersForOrder()
  return <QuoteCreateClient initialCustomers={customers.data ?? []} />
}
