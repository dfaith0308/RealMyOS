import { seedDefaultOptions, getTagOptions } from '@/actions/customer-tag-options'
import TagOptionsManagerClient from '@/components/settings/TagOptionsManagerClient'

export const metadata = { title: '분류 관리 — RealMyOS' }

export default async function TagsSettingsPage() {
  await seedDefaultOptions()
  const res = await getTagOptions()

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>분류 관리</h1>
        <p style={{ fontSize: 13, color: 'var(--ds-text-muted)', marginTop: 6 }}>
          카테고리/옵션은 DB에서 관리됩니다. 삭제 대신 비활성화합니다.
        </p>
      </div>

      <TagOptionsManagerClient initialOptions={res.data ?? []} />
    </main>
  )
}

