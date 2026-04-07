import { getAcquisitionChannels } from '@/actions/acquisition-channel'
import CustomerCreateForm from '@/components/customer/CustomerCreateForm'

export const metadata = { title: '거래처 등록 — RealMyOS' }

export default async function CustomerNewPage() {
  const result = await getAcquisitionChannels()
  const channels = result.data ?? []

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <CustomerCreateForm channels={channels} />
    </main>
  )
}
