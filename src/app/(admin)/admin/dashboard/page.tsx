import Link from 'next/link'
import { AlertTriangle, CalendarClock, ScrollText } from 'lucide-react'
import { getActionQueue, expireStaleItems, resolveActionQueueItem } from '@/actions/admin/action-queue'
import s from '../../admin-blue.module.css'

export const metadata = { title: '중앙 대시보드 — 식식이 관리자' }

export default async function AdminDashboardPage() {
  // 72h 초과 항목 만료 처리 (best-effort; 실패해도 페이지는 보여준다)
  await expireStaleItems().catch(() => {})

  const q = await getActionQueue()

  const queue = q.data ?? []
  const critical = queue.filter((x) => x.priority === 'critical').slice(0, 10)
  const today = queue.filter((x) => x.priority === 'today').slice(0, 10)

  return (
    <main className={s.scope}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>중앙 대시보드</h1>
          <p className={s.subtitle}>
            지금 무엇을 봐야 하는지 한 화면에 모았습니다. 모든 숫자는 저장값이 아니라 요청 시점에
            실시간으로 계산됩니다.
          </p>
        </div>
        <Link href="/admin/logs" className={s.headerLink}>
          <ScrollText size={15} /> 전체 로그 보기
        </Link>
      </header>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <CalendarClock size={17} /> 실행 큐
          </h2>
          <span className={s.sectionNote}>우선순위별로 오늘 처리해야 할 항목</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <QueuePanel title="Critical — 즉시 개입" items={critical} alert />
          <QueuePanel title="Today — 오늘 처리" items={today} />
        </div>
      </section>
    </main>
  )
}

function QueuePanel({
  title,
  items,
  alert = false,
}: {
  title: string
  items: any[]
  alert?: boolean
}) {
  async function resolve(id: string) {
    'use server'
    await resolveActionQueueItem(id)
  }

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={`${s.panelTitle} ${alert ? s.panelTitleAlert : ''}`}>
          {alert && <AlertTriangle size={15} />}
          {title}
        </h3>
        <Link href="/admin/trades" className={s.ghostBtn}>
          관제
        </Link>
      </div>
      {items.length === 0 ? (
        <div className={s.empty}>항목이 없습니다.</div>
      ) : (
        <div>
          {items.map((it) => (
            <div key={it.id} className={s.queueRow}>
              <div className={s.queueBody}>
                <div className={s.queueTitle}>{it.title}</div>
                <div className={s.queueDesc}>{it.description ?? ''}</div>
              </div>
              <div className={s.queueActions}>
                <form action={resolve.bind(null, it.id)}>
                  <button type="submit" className={s.primaryBtn}>
                    처리
                  </button>
                </form>
                <Link href="/admin/trades" className={s.ghostBtn}>
                  상세
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
