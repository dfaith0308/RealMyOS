import Link from 'next/link'
import { getRiskSummary, runAnalysisEngine } from '@/actions/admin/analysis-engine'
import { getActionQueue } from '@/actions/admin/action-queue'
import s from '../admin-shared.module.css'

export default async function AdminEnginePage() {
  const [risk, q] = await Promise.all([getRiskSummary(), getActionQueue()])

  const queue = q.data ?? []
  const recent = queue.slice(0, 20)

  async function run() {
    'use server'
    await runAnalysisEngine()
  }

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>판단/분석 엔진</h1>
          <p className={s.subtitle}>
            입력(Intelligence) → 판단(Decision) → 우선순위(Priority) → 출력(Trigger Routing) → 오탐 피드백
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/trades" className={s.ghostBtnMd}>
            Action Queue로 이동
          </Link>
          <form action={run}>
            <button type="submit" className={s.primaryBtnMd}>
              분석 실행
            </button>
          </form>
        </div>
      </header>

      {!risk.success || !risk.data ? (
        <div className={s.alert}>{risk.error ?? '요약 조회 실패'}</div>
      ) : (
        <section className={s.grid4}>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>신뢰도 위험</div>
            <div className={s.kpiValue}>{risk.data.trust_risk_count}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>거래 위험</div>
            <div className={s.kpiValue}>{risk.data.trade_risk_count}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>미정산 위험</div>
            <div className={s.kpiValue}>{risk.data.settlement_risk_count}</div>
          </div>
          <div className={s.kpiCard}>
            <div className={s.kpiTitle}>미처리 Queue</div>
            <div className={s.kpiValue}>{risk.data.action_queue_open_count}</div>
          </div>
        </section>
      )}

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>최근 감지 이력 (Action Queue)</h2>
          <Link href="/admin/trades" className={s.ghostBtnMd}>
            관제
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className={s.empty}>표시할 항목이 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['priority', 'category', 'title', 'created_at'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((it) => (
                  <tr key={it.id}>
                    <td className={s.td}>{it.priority}</td>
                    <td className={s.td}>{it.category}</td>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{it.title}</div>
                      <div className={s.cellMutedSm}>{it.description ?? ''}</div>
                    </td>
                    <td className={s.tdNowrap}>{String(it.created_at).slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
