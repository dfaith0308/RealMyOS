import { getLearningStatus } from '@/actions/admin/learning-center'
import s from '../admin-shared.module.css'

function Progress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={s.progressTrack}>
      <div className={s.progressFill} style={{ ['--progress-pct' as string]: `${pct}%` }} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={s.rowStat}>
      <div className={s.rowStatLabel}>{label}</div>
      <div className={s.rowStatValue}>{value}</div>
    </div>
  )
}

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? s.checkOk : s.checkBad}>{ok ? '✅' : '❌'}</span>
}

export default async function AdminLearningCenterPage() {
  const res = await getLearningStatus()

  if (!res.success || !res.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>데이터 학습 센터</h1>
        <div className={s.alert}>{res.error ?? '조회 실패'}</div>
      </main>
    )
  }

  const d = res.data
  const st = d.stats

  return (
    <main className={s.main}>
      <header>
        <h1 className={s.title}>데이터 학습 센터</h1>
        <p className={s.subtitle}>데이터 → 학습 → 판단 → 정책 → 자동화 → 결과 → 재학습</p>
      </header>

      <section className={s.grid3}>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>현재 단계</div>
          <div className={s.kpiValue}>{d.stage}</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>정책 자동화율</div>
          <div className={s.kpiValue}>{d.policy_automation_rate.toFixed(1)}%</div>
        </div>
        <div className={s.kpiCard}>
          <div className={s.kpiTitle}>관리자 개입률</div>
          <div className={s.kpiValue}>{d.admin_intervention_rate.toFixed(1)}%</div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>다음 단계 전환 달성률</h2>
          <div className={s.inlineMuted}>{d.progress_rate}%</div>
        </div>
        <div className={s.panelBody}>
          <Progress value={d.progress_rate} />
          <div className={s.panelInsetTop}>
            <Row
              label="orders 500+"
              value={
                <>
                  {d.conditions.orders_500.current}/{d.conditions.orders_500.target} <Check ok={d.conditions.orders_500.ok} />
                </>
              }
            />
            <Row
              label="신뢰도 참여자 50+"
              value={
                <>
                  {d.conditions.trust_50.current}/{d.conditions.trust_50.target} <Check ok={d.conditions.trust_50.ok} />
                </>
              }
            />
            <Row
              label="자동 판단 정확도 70%+"
              value={
                <>
                  {d.conditions.accuracy_70.current}/{d.conditions.accuracy_70.target}{' '}
                  <Check ok={d.conditions.accuracy_70.ok} />
                </>
              }
            />
          </div>
        </div>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>플랫폼 데이터 현황</h2>
        </div>
        <div className={s.panelBody}>
          <Row label="총 주문 수(confirmed)" value={st.confirmed_orders} />
          <Row label="총 거래처 수(tenants)" value={st.total_tenants} />
          <Row label="신뢰도 참여자 수(trust_scores)" value={st.trust_participants} />
          <Row label="Action Queue 총 건수" value={st.action_queue_total} />
          <Row label="Action Queue 완료" value={st.action_queue_completed} />
          <Row label="Action Queue 만료" value={st.action_queue_expired} />
          <Row label="자동 판단 정확도(Proxy)" value={`${st.auto_judgement_accuracy.toFixed(1)}%`} />
        </div>
      </section>
    </main>
  )
}
