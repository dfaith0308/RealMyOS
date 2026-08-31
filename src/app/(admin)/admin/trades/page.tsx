import Link from 'next/link'
import { getActionQueue, resolveActionQueueItem } from '@/actions/admin/action-queue'
import {
  detectChurnRisk,
  detectTrustRisk,
  upsertActionQueueForTradeAnomalies,
} from '@/actions/admin/trade-monitor'
import s from '../../admin-shared.module.css'

function hoursSince(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / 3600000)
}

function priorityBadgeClass(p: string) {
  if (p === 'critical') return s.badgeCritical
  if (p === 'high') return s.badgeHigh
  if (p === 'today') return s.badgeToday
  return s.badgeNormal
}

function priorityLabel(p: string) {
  const m: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    today: 'Today',
    normal: 'Normal',
  }
  return m[p] ?? m.normal
}

export default async function AdminTradeMonitorPage() {
  await upsertActionQueueForTradeAnomalies().catch(() => {})

  /** 수동 감지 — 이탈 위험 + 신뢰도 위험 (분석엔진에서 이관) */
  async function runDetection() {
    'use server'
    await detectChurnRisk()
    await detectTrustRisk()
  }

  // action_queue 를 보여주는 곳은 여기 하나다 — 한 번만 읽고 카테고리로 나눈다
  const q = await getActionQueue()
  const items = q.data ?? []

  const byCategory = (c: string) => items.filter((it) => it.category === c)
  const trade = byCategory('trade')
  const settlement = byCategory('settlement')
  const trust = byCategory('trust')
  const others = items.filter(
    (it) => !['trade', 'settlement', 'trust'].includes(it.category),
  )

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>이상거래 확인</h1>
          <p className={s.subtitle}>
            이상 감지 → 자동 개입(Level) → Action Queue 생성 → 관리자 예외 처리
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/dashboard" className={s.ghostBtn}>
            홈
          </Link>
          <Link href="/rfq" className={s.ghostBtn}>
            RFQ 보기
          </Link>
          <form action={runDetection}>
            <button type="submit" className={s.primaryBtnMd}>
              감지 실행 → 적재
            </button>
          </form>
        </div>
      </header>

      <section className={s.grid4}>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>미처리 Queue 전체</div>
          <div className={s.kpiValue}>{items.length}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>Trade 이상</div>
          <div className={s.kpiValue}>{trade.length}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>Settlement 이상</div>
          <div className={s.kpiValue}>{settlement.length}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>신뢰도 위험</div>
          <div className={s.kpiValue}>{trust.length}</div>
        </div>
      </section>

      {!q.success && <div className={s.alert}>{q.error ?? 'Action Queue 조회 실패'}</div>}

      <Panel title="이상 감지 목록 — Trade" items={trade} />
      <Panel title="이상 감지 목록 — Settlement" items={settlement} />
      <Panel title="이상 감지 목록 — 신뢰도" items={trust} />
      {others.length > 0 && <Panel title="이상 감지 목록 — 기타" items={others} />}
    </main>
  )
}

function Panel({ title, items }: { title: string; items: any[] }) {
  async function resolve(id: string) {
    'use server'
    await resolveActionQueueItem(id)
  }

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h2 className={s.panelTitle}>{title}</h2>
        <div className={s.inlineMuted}>총 {items.length}건</div>
      </div>
      {items.length === 0 ? (
        <div className={s.empty}>이상 감지 항목이 없습니다.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                {['우선순위', '카테고리', '제목', '체류(시간)', '생성', ''].map((h) => (
                  <th key={h} className={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className={s.tdNowrap}>
                    <span className={priorityBadgeClass(it.priority)}>{priorityLabel(it.priority)}</span>
                  </td>
                  <td className={s.tdNowrap}>{it.category}</td>
                  <td className={s.tdWide}>
                    <div className={s.cellStrong}>{it.title}</div>
                    <div className={s.cellMutedSm}>{it.description ?? ''}</div>
                  </td>
                  <td className={s.tdNowrap}>{hoursSince(it.created_at)}h</td>
                  <td className={s.tdNowrap}>{String(it.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td className={s.tdNowrap}>
                    {it?.action_options?.rfq_id ? (
                      <Link href={`/admin/trades/${it.action_options.rfq_id}`} className={s.ghostBtn}>
                        거래 상세 →
                      </Link>
                    ) : it?.action_options?.payment_id ? (
                      <Link href={`/admin/trades/${it.action_options.payment_id}`} className={s.ghostBtn}>
                        거래 상세 →
                      </Link>
                    ) : null}
                    <form action={resolve.bind(null, it.id)}>
                      <button type="submit" className={s.primaryBtn}>
                        처리
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

