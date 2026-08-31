import Link from 'next/link'
import { getAdminSettings } from '@/actions/admin/policy-console'
import PolicyConsoleClient from './PolicyConsoleClient'
import s from '../../admin-shared.module.css'

export default async function AdminPolicyPage() {
  const res = await getAdminSettings()

  if (!res.success || !res.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>정책 콘솔</h1>
        <p className={s.errText}>{res.error ?? '설정을 불러오지 못했습니다.'}</p>
      </main>
    )
  }

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>정책 콘솔</h1>
          <p className={s.subtitleMax780}>
            PRODUCT §10-10 — 코드 배포 없이 플랫폼 정책을 변경합니다. 모든 변경은 admin_logs에 이전/이후 값과 변경자로 기록됩니다.
          </p>
        </div>
        <Link href="/admin/settlements" className={s.ghostBtnMd}>
          수익/정산
        </Link>
      </header>

      <PolicyConsoleClient initial={res.data.grouped} />

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>A/B 실험 (준비중)</h2>
        </div>
        <div className={s.panelBody}>
          <div className={s.alert}>
            실험 콘솔은 값을 <code>admin_settings</code> 의 <code>experiment_*</code> 키로 저장하기만 하고,
            그 값을 읽어 동작을 가르는 코드가 아직 어디에도 없습니다. 분기 지점 없이 값만 쌓이면
            실험을 하고 있다고 착각하게 되므로 입력 화면을 닫아 두었습니다.
            정책값 변경은 위 목록에서 그대로 하시면 됩니다.
          </div>
        </div>
      </section>
    </main>
  )
}

