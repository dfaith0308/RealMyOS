import Link from 'next/link'
import { getGrowthMetrics } from '@/actions/admin/growth-engine'
import { submitGrowthChurnEnqueue, submitGrowthDormantEnqueue } from './actions'
import s from '../../admin-shared.module.css'

export default async function AdminGrowthPage() {
  const metrics = await getGrowthMetrics()

  if (!metrics.success || !metrics.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>성장/영업 엔진</h1>
        <p className={s.errText}>{metrics.error ?? '지표를 불러오지 못했습니다.'}</p>
      </main>
    )
  }

  const m = metrics.data
  const maxMonth = Math.max(...m.monthly_gmv_trend.map((x) => x.gmv), 1)

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>성장/영업 엔진</h1>
          <p className={s.subtitleMax720}>
            PRODUCT §10-8 — 타깃 자동 생성·우선순위 실행. 아래 버튼은 규칙 기반 감지로 Action Queue를 적재합니다.
          </p>
        </div>
        <Link href="/admin/engine" className={s.ghostBtnMd}>
          분석 엔진
        </Link>
      </header>

      <section className={s.grid4}>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>신규 참여자 (30일)</div>
          <div className={s.kpiValue}>{m.new_participants_30d}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>활성 참여자 (30일)</div>
          <div className={s.kpiValue}>{m.active_participants_30d}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>이탈 위험 (추정)</div>
          <div className={s.kpiValue}>{m.churn_risk_customers}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>휴면 참여자 (추정)</div>
          <div className={s.kpiValue}>{m.dormant_tenants}</div>
        </div>
      </section>

      <section className={`${s.panel} ${s.panelPadded}`}>
        <h2 className={s.panelTitle}>플랫폼 GMV (확정 주문 · 최근 30일)</h2>
        <div className={s.gmvAmount}>
          {m.platform_gmv_30d.toLocaleString()}
          <span className={s.gmvSuffix}>원</span>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>월별 GMV 추이 (최근 6개월, 확정 주문)</h2>
        </div>
        <div className={s.chartRow}>
          {m.monthly_gmv_trend.map((b) => {
            const h = Math.round((b.gmv / maxMonth) * 120)
            return (
              <div key={b.month} className={s.chartCol}>
                <div
                  title={`${b.gmv.toLocaleString()}원`}
                  className={s.chartBar}
                  style={{ ['--bar-h' as string]: `${Math.max(4, h)}px` }}
                />
                <div className={s.chartMonth}>{b.month.slice(5)}월</div>
              </div>
            )
          })}
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>Action Queue 적재</h2>
        </div>
        <div className={s.panelBody}>
          <div className={s.actionsRow}>
            <form action={submitGrowthChurnEnqueue}>
              <button type="submit" className={s.primaryBtnMd}>
                이탈 위험 감지 → 적재
              </button>
            </form>
            <form action={submitGrowthDormantEnqueue}>
              <button type="submit" className={s.ghostBtnMd}>
                휴면 감지 → 적재
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

