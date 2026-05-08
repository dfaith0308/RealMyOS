import Link from 'next/link'
import { getAdminSettings } from '@/actions/admin/policy-console'
import PolicyConsoleClient from './PolicyConsoleClient'
import ExperimentsClient from './ExperimentsClient'
import s from '../../admin-shared.module.css'

export default async function AdminPolicyPage() {
  const res = await getAdminSettings()

  if (!res.success || !res.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>정책/실험 콘솔</h1>
        <p className={s.errText}>{res.error ?? '설정을 불러오지 못했습니다.'}</p>
      </main>
    )
  }

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>정책/실험 콘솔</h1>
          <p className={s.subtitleMax780}>
            PRODUCT §10-10 — 코드 배포 없이 플랫폼 정책을 변경합니다. 모든 변경은 admin_logs에 이전/이후 값과 변경자로 기록됩니다.
          </p>
        </div>
        <Link href="/admin/settlements" className={s.ghostBtnMd}>
          수익/정산
        </Link>
      </header>

      <PolicyConsoleClient initial={res.data.grouped} />

      <ExperimentsClient />
    </main>
  )
}

