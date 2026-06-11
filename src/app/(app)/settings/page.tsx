import Link from 'next/link'
import { getSettings } from '@/actions/settings'
import { DEFAULT_SETTINGS } from '@/constants/settings'
import SettingsForm from '@/components/settings/SettingsForm'
import { getAligoSettings } from '@/actions/message'
import AligoSettingsForm from '@/components/settings/AligoSettingsForm'
import hubStyles from './settings-hub.module.css'

export const metadata = { title: '설정 — RealMyOS' }

export default async function SettingsPage() {
  const result = await getSettings()
  const settings = result.success && result.data ? result.data : DEFAULT_SETTINGS
  const aligo = await getAligoSettings()

  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 40 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 60px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>설정</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            모든 기준값은 여기서 관리합니다. 코드 수정 없이 변경 가능합니다.
          </p>
        </div>

        <section className={hubStyles.hubSection} aria-label="설정 하위 메뉴">
          <div className={hubStyles.hubGrid}>
            <Link href="/settings/tags" className={hubStyles.hubCard}>
              <div className={hubStyles.hubCardTitle}>운영분류 관리</div>
              <div className={hubStyles.hubCardDesc}>
                거래처 분류 카테고리와 옵션을 직접 만들고 관리합니다.
              </div>
            </Link>
            <Link href="/settings/messages" className={hubStyles.hubCard}>
              <div className={hubStyles.hubCardTitle}>메시지 템플릿</div>
              <div className={hubStyles.hubCardDesc}>
                자동화 영업에 사용할 메시지 템플릿을 관리합니다.
              </div>
            </Link>
          </div>
        </section>

        <SettingsForm initial={settings} />
        <div style={{ height: 24 }} />
        <AligoSettingsForm initial={aligo.data ?? {}} />
      </div>
    </main>
  )
}
