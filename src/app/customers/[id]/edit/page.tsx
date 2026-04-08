import { notFound } from 'next/navigation'
import { getCustomerDetail } from '@/actions/customer-query'
import { getAcquisitionChannels } from '@/actions/acquisition-channel'
import CustomerEditForm from '@/components/customer/CustomerEditForm'

export const metadata = { title: '거래처 수정 — RealMyOS' }

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [detailResult, channelsResult] = await Promise.all([
    getCustomerDetail(id),
    getAcquisitionChannels(),
  ])

  if (!detailResult.success || !detailResult.data) notFound()

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <CustomerEditForm
        customer={detailResult.data}
        channels={channelsResult.data ?? []}
      />
    </main>
  )
}
