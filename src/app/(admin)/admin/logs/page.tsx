import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'
import { getAdminLogs } from '@/actions/admin'
import s from '../../admin-blue.module.css'

export const metadata = { title: '활동 기록 — 식식이 관리자' }

export default async function AdminLogsPage(props: {
  searchParams?: Promise<{ action_type?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const actionTypeRaw = Array.isArray(searchParams?.action_type)
    ? searchParams?.action_type?.[0]
    : searchParams?.action_type
  const action_type = actionTypeRaw?.trim() ? actionTypeRaw : null

  const res = await getAdminLogs({ action_type })

  if (!res.success) {
    return (
      <main className={s.scope}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>활동 기록</h1>
          </div>
          <Link href="/admin/dashboard" className={s.headerLink}>
            <ArrowLeft size={15} /> 홈
          </Link>
        </header>
        <div className={s.errText}>{res.error}</div>
      </main>
    )
  }

  const logs = res.data.logs
  const actionTypes = Array.from(new Set(logs.map((l) => l.action_type).filter(Boolean))) as string[]

  return (
    <main className={s.scope}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>
            <ScrollText size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />
            활동 기록
          </h1>
          <p className={s.subtitle}>최근 관리자 행동 기록입니다. action_type으로 좁혀 볼 수 있습니다.</p>
        </div>
        <Link href="/admin/dashboard" className={s.headerLink}>
          <ArrowLeft size={15} /> 홈
        </Link>
      </header>

      <nav className={s.chipRow}>
        <Link href="/admin/logs" className={`${s.chip} ${!action_type ? s.chipActive : ''}`}>
          전체
        </Link>
        {actionTypes.slice(0, 12).map((t) => (
          <Link
            key={t}
            href={`/admin/logs?action_type=${encodeURIComponent(t)}`}
            className={`${s.chip} ${action_type === t ? s.chipActive : ''}`}
          >
            {t}
          </Link>
        ))}
      </nav>

      <section className={s.panel}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>action_type</th>
                <th className={s.th}>reason</th>
                <th className={s.th}>admin_id</th>
                <th className={s.th}>tenant_id</th>
                <th className={s.th}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className={s.tdStrong}>{l.action_type ?? '-'}</td>
                  <td className={s.tdWrap}>{(l as any).reason ?? '-'}</td>
                  <td className={s.tdMuted}>{l.admin_id ?? '-'}</td>
                  <td className={s.tdMuted}>{l.tenant_id ?? '-'}</td>
                  <td className={s.tdMuted}>
                    {l.created_at ? new Date(l.created_at).toLocaleString('ko-KR') : '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td className={s.td} colSpan={5}>
                    <div className={s.empty}>데이터가 없습니다.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
