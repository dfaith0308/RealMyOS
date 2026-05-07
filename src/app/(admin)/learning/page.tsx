import { getLearningStatus } from '@/actions/admin/learning-center'

function Progress({ value }: { value: number }) {
  return (
    <div style={{ height: 10, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: '#111827' }} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#111827', fontWeight: 900 }}>{value}</div>
    </div>
  )
}

function Check({ ok }: { ok: boolean }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 900, color: ok ? '#15803D' : '#DC2626' }}>
      {ok ? '✅' : '❌'}
    </span>
  )
}

export default async function AdminLearningCenterPage() {
  const res = await getLearningStatus()

  if (!res.success || !res.data) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>데이터 학습 센터</h1>
        <div style={{ marginTop: 12, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          {res.error ?? '조회 실패'}
        </div>
      </main>
    )
  }

  const d = res.data
  const s = d.stats

  return (
    <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>데이터 학습 센터</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
          데이터 → 학습 → 판단 → 정책 → 자동화 → 결과 → 재학습
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={cardTitle}>현재 단계</div>
          <div style={cardValue}>{d.stage}</div>
        </div>
        <div style={card}>
          <div style={cardTitle}>정책 자동화율</div>
          <div style={cardValue}>{d.policy_automation_rate.toFixed(1)}%</div>
        </div>
        <div style={card}>
          <div style={cardTitle}>관리자 개입률</div>
          <div style={cardValue}>{d.admin_intervention_rate.toFixed(1)}%</div>
        </div>
      </section>

      <section style={panel}>
        <div style={panelHeader}>
          <h2 style={panelTitle}>다음 단계 전환 달성률</h2>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{d.progress_rate}%</div>
        </div>
        <div style={{ padding: 14 }}>
          <Progress value={d.progress_rate} />
          <div style={{ marginTop: 12 }}>
            <Row label="orders 500+" value={<>{d.conditions.orders_500.current}/{d.conditions.orders_500.target} <Check ok={d.conditions.orders_500.ok} /></>} />
            <Row label="신뢰도 참여자 50+" value={<>{d.conditions.trust_50.current}/{d.conditions.trust_50.target} <Check ok={d.conditions.trust_50.ok} /></>} />
            <Row label="자동 판단 정확도 70%+" value={<>{d.conditions.accuracy_70.current}/{d.conditions.accuracy_70.target} <Check ok={d.conditions.accuracy_70.ok} /></>} />
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={panelHeader}>
          <h2 style={panelTitle}>플랫폼 데이터 현황</h2>
        </div>
        <div style={{ padding: 14 }}>
          <Row label="총 주문 수(confirmed)" value={s.confirmed_orders} />
          <Row label="총 거래처 수(tenants)" value={s.total_tenants} />
          <Row label="신뢰도 참여자 수(trust_scores)" value={s.trust_participants} />
          <Row label="Action Queue 총 건수" value={s.action_queue_total} />
          <Row label="Action Queue 완료" value={s.action_queue_completed} />
          <Row label="Action Queue 만료" value={s.action_queue_expired} />
          <Row label="자동 판단 정확도(Proxy)" value={`${s.auto_judgement_accuracy.toFixed(1)}%`} />
        </div>
      </section>
    </main>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const cardTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 800 }
const cardValue: React.CSSProperties = { fontSize: 24, fontWeight: 900, color: '#111827' }
const panel: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }
const panelHeader: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }

