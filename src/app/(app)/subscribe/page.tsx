import { getSubscriptionStatus } from '@/actions/subscribe'
import SubscribeClient from '@/components/subscribe/SubscribeClient'

export const metadata = { title: '구독 결제 — RealMyOS' }

export default async function SubscribePage() {
  const status = await getSubscriptionStatus()
  return <SubscribeClient status={status} />
}

