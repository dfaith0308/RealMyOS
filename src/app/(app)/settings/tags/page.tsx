import { getTagOptions } from '@/actions/customer-tag-options'
import TagOptionsManagerClient from '@/components/settings/TagOptionsManagerClient'

export const metadata = { title: '운영분류 관리 — RealMyOS' }

export default async function TagsSettingsPage() {
  const res = await getTagOptions()
  return <TagOptionsManagerClient initialOptions={res.data ?? []} />
}
