import CustomerCreateForm from '@/components/customer/CustomerCreateForm'
import { getAcquisitionChannels } from '@/actions/acquisition-channel'

export const metadata = { title: '거래처 등록 — RealMyOS' }

export default async function CustomerNewPage() {
  const channelsResult = await getAcquisitionChannels()
  const channels = channelsResult.data ?? []

  return <CustomerCreateForm channels={channels} />
}
