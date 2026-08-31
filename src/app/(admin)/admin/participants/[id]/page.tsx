import Link from 'next/link'
import { getTrustDetail, getTrustScoreLogs, type TrustRole } from '@/actions/admin/trust-engine'
import s from '../../../admin-shared.module.css'

function fmt(iso: string | null | undefined) {
  if (!iso) return '-'
  return String(iso).slice(0, 19).replace('T', ' ')
}

function fmtDelta(before: number | null, after: number | null) {
  if (before == null || after == null) return '-'
  const d = after - before
  if (!Number.isFinite(d) || d === 0) return '0'
  return d > 0 ? `+${d}` : String(d)
}

export default async function ParticipantTrustDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { role?: string }
}) {
  const tenant_id = params.id
  const role = (searchParams?.role === 'supplier' || searchParams?.role === 'restaurant')
    ? (searchParams?.role as TrustRole)
    : undefined

  const [detail, logs] = await Promise.all([getTrustDetail(tenant_id, role), getTrustScoreLogs(tenant_id, role)])
  const rows = detail.success && detail.data ? detail.data : []

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>신뢰도 상세</h1>
          <p className={s.subtitleMax780}>
            tenant_id: <code className={s.code}>{tenant_id}</code>{role ? <> · role: <code className={s.code}>{role}</code></> : null}
          </p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/participants" className={s.ghostBtnMd}>목록</Link>
          <Link href="/admin/trades" className={s.ghostBtnMd}>이상거래 확인</Link>
        </div>
      </header>

      {!detail.success && <div className={s.alert}>{detail.error ?? '조회 실패'}</div>}

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>현재 점수/컴포넌트</h2>
        </div>
        {rows.length === 0 ? (
          <div className={s.empty}>
            신뢰도 데이터가 없습니다. <strong>신뢰도 배치 실행</strong> 후 데이터가 생성됩니다.
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['role', 'score', 'level', 'delivery_rate', 'payment_rate', 'claim_count', 'rfq_complete_rate', 'repeat_trade_rate', 'updated_at'].map((h) => (
                    <th key={h} className={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.role}:${r.id}`}>
                    <td className={s.td}>{r.role}</td>
                    <td className={s.td}>{r.score ?? 0}</td>
                    <td className={s.td}>{r.level ?? '-'}</td>
                    <td className={s.td}>{r.delivery_rate ?? '-'}</td>
                    <td className={s.td}>{r.payment_rate ?? '-'}</td>
                    <td className={s.td}>{r.claim_count ?? '-'}</td>
                    <td className={s.td}>{r.rfq_complete_rate ?? '-'}</td>
                    <td className={s.td}>{r.repeat_trade_rate ?? '-'}</td>
                    <td className={s.td}>{fmt(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>점수 변화 이력</h2>
        </div>
        {!logs.success ? (
          <div className={s.alert}>{logs.error ?? '이력 조회 실패'}</div>
        ) : (logs.data ?? []).length === 0 ? (
          <div className={s.empty}>신뢰도 배치 실행 후 이력이 쌓입니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['날짜', '이전', '이후', 'Δ', '레벨(이전→이후)', '사유'].map((h) => (
                    <th key={h} className={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(logs.data ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className={s.td}>{fmt(l.created_at)}</td>
                    <td className={s.td}>{l.before_score ?? '-'}</td>
                    <td className={s.td}>{l.after_score ?? '-'}</td>
                    <td className={s.td}>{fmtDelta(l.before_score, l.after_score)}</td>
                    <td className={s.td}>
                      {(l.before_level ?? '-')}{' → '}{(l.after_level ?? '-')}
                    </td>
                    <td className={s.td}>{l.reason ?? '-'}</td>
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

