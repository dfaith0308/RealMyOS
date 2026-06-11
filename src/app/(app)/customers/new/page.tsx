import CustomerCreateForm from '@/components/customer/CustomerCreateForm'
import { getAcquisitionChannels } from '@/actions/acquisition-channel'
import { getTagOptions, seedDefaultOptions } from '@/actions/customer-tag-options'

export const metadata = { title: '거래처 등록 — RealMyOS' }

export default async function CustomerNewPage() {
  await seedDefaultOptions().catch(() => {})

  const [channelsResult, tagOptionsResult] = await Promise.all([
    getAcquisitionChannels(),
    getTagOptions(),
  ])

  const channels = channelsResult.data ?? []
  const tagOptions = tagOptionsResult.data ?? []

  console.log('tagOptions:', tagOptionsResult)

  return <CustomerCreateForm channels={channels} tagOptions={tagOptions} />
}
