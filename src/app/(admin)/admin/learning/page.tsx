import { getLearningStatus } from '@/actions/admin/learning-center'
import { getConfirmedMasters, getUnconfirmedMasters } from '@/actions/admin/ingredient-master'
import UnconfirmedMasterList from '@/components/admin/UnconfirmedMasterList'
import s from '../../admin-shared.module.css'

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
  const [learningRes, confirmedRes, unconfirmedRes] = await Promise.all([
    getLearningStatus(),
    getConfirmedMasters(),
    getUnconfirmedMasters(),
  ])

  if (!learningRes.success || !learningRes.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>데이터 학습 센터</h1>
        <div className={s.alert}>{learningRes.error ?? '조회 실패'}</div>
      </main>
    )
  }

  const d = learningRes.data
  const st = d.stats
  const confirmed = (confirmedRes.data ?? []) as Array<{
    id: string
    name: string
    spec?: string | null
    brand?: string | null
    barcode?: string | null
    ingredient_mappings?: Array<{ source_type: string }>
  }>
  const unconfirmed = (unconfirmedRes.data ?? []) as unknown[]

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
                  {d.conditions.accuracy_70.current}/{d.conditions.accuracy_70.target} <Check ok={d.conditions.accuracy_70.ok} />
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

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>식자재 마스터 DB</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#1f5d3a', fontWeight: 600 }}>
              확정 {confirmed.length}개
            </span>
            {unconfirmed.length > 0 && (
              <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                미확정 {unconfirmed.length}개 검토 필요
              </span>
            )}
          </div>
        </div>
        <div className={s.panelBody}>
          {unconfirmed.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 10px' }}>
                ⚠️ 미확정 — 바코드/품목보고번호 없이 등록된 상품
              </p>
              <UnconfirmedMasterList items={unconfirmed} />
            </div>
          )}

          <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 10px' }}>
            ✅ 확정 마스터 상품
          </p>
          {confirmed.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>상품을 등록하면 여기에 나타납니다</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>상품명</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>브랜드</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>바코드</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>소스</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', color: '#1a1a1a' }}>
                      {m.name}
                      {m.spec ? ` ${m.spec}` : ''}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{m.brand ?? '-'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{m.barcode ?? '-'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {(m.ingredient_mappings ?? []).map((mp) => (
                        <span
                          key={mp.source_type}
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: mp.source_type === 'admin' ? '#f0f7f3' : '#f0f4ff',
                            color: mp.source_type === 'admin' ? '#1f5d3a' : '#4f46e5',
                            marginRight: 4,
                          }}
                        >
                          {mp.source_type}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  )
}

