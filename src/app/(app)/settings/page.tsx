import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import SettingsForm from '@/components/settings/SettingsForm'

export const metadata = { title: '설정 — RealMyOS' }

export default async function SettingsPage() {
  const result = await getSettings()
  const settings = result.success && result.data ? result.data : DEFAULT_SETTINGS

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 40 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>설정</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            모든 기준값은 여기서 관리합니다. 코드 수정 없이 변경 가능합니다.
          </p>
        </div>
        <SettingsForm initial={settings} />
      </div>
    </main>
  )
}
