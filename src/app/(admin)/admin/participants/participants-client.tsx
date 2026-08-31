'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { calculateTrustScore, getParticipants, updateTrustScore, type ParticipantRow, type TrustRole } from '@/actions/admin/trust-engine'
import s from '../../admin-shared.module.css'

/** 신뢰도 산정이 준비중이라 쓰기 버튼에 붙이는 사유 — 화면 배너와 같은 내용 */
const DISABLED_REASON =
  '신뢰도 산정 준비중 — 납품완료·클레임 데이터가 아직 기록되지 않아 점수가 뒤집힙니다. 쓰기 동작을 잠가 두었습니다.'

function levelBadgeClass(level: number) {
  if (level >= 3) return s.badgeL3
  if (level === 2) return s.badgeL2
  if (level === 1) return s.badgeL1
  return s.badgeL0
}

function levelLabel(level: number) {
  if (level >= 3) return 'Level 3'
  if (level === 2) return 'Level 2'
  if (level === 1) return 'Level 1'
  return 'Normal'
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  return String(iso).slice(0, 19).replace('T', ' ')
}

export default function ParticipantsClient({
  initial,
  initialError,
}: {
  initial: ParticipantRow[]
  initialError: string | null
}) {
  const [rows, setRows] = useState<ParticipantRow[]>(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [role, setRole] = useState<TrustRole | ''>('')
  const [level, setLevel] = useState<number | ''>('')
  const [scoreMin, setScoreMin] = useState('')
  const [scoreMax, setScoreMax] = useState('')
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (role && r.role !== role) return false
      if (level !== '' && r.level !== level) return false
      const min = scoreMin.trim() ? parseInt(scoreMin, 10) : null
      const max = scoreMax.trim() ? parseInt(scoreMax, 10) : null
      if (min != null && !Number.isNaN(min) && r.score < min) return false
      if (max != null && !Number.isNaN(max) && r.score > max) return false
      return true
    })
  }, [rows, role, level, scoreMin, scoreMax])

  function refresh() {
    setError(null)
    startTransition(async () => {
      const res = await getParticipants({
        role: role || undefined,
        level: level === '' ? undefined : level,
        score_min: scoreMin.trim() ? parseInt(scoreMin, 10) : undefined,
        score_max: scoreMax.trim() ? parseInt(scoreMax, 10) : undefined,
      })
      if (!res.success) {
        setError(res.error ?? '조회 실패')
        return
      }
      setRows(res.data ?? [])
    })
  }

  async function recalc(tenant_id: string, r: TrustRole) {
    setError(null)
    startTransition(async () => {
      const res = await calculateTrustScore(tenant_id, r)
      if (!res.success || !res.data) {
        setError(res.error ?? '계산 실패')
        return
      }
      alert(`계산 결과: score=${res.data.score}, level=${res.data.level}`)
    })
  }

  // 산정이 준비중이라 쓰기 경로는 잠가 둔다 — updateTrustScore 는 trust_scores 를
  // upsert 하고 Level 3 이면 Action Queue 까지 만든다. 뒤집힌 점수가 정산·제재 판단으로
  // 흘러가지 않도록 화면에서 막는다. (함수 자체는 남겨 둔다)
  void updateTrustScore

  return (
    <div className={s.stackCol}>
      <div className={s.alert}>
        <strong>신뢰도 산정 준비중</strong> — 점수 구성요소 5개 중 4개가 아직 채워지지 않는
        입력이라 지금 계산하면 결과가 뒤집힙니다. 납품률(35%)은{' '}
        <code>order_status = &apos;납품완료&apos;</code> 로 세는데 운영 데이터에는 그 값이 한 건도
        없어(접수/확인만 존재) 주문이 있는 참여자는 자동으로 0%가 되고, 클레임
        (<code>contact_logs.outcome_type</code>)과 RFQ 완료율은 원본이 비어 있습니다. 그 결과 실제
        거래 중인 공급자가 최하 Level 3, 거래가 없는 참여자가 100점으로 나옵니다. 쓰기 동작
        (배치·적용)은 잠가 두었고 조회만 가능합니다. 납품완료·클레임 데이터가 쌓이면 다시 엽니다.
      </div>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>참여자 네트워크</h1>
          <p className={s.subtitle}>신뢰도 계산 → Level(0~3) → 정책/개입 → Action Queue</p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/participants/relationships" className={s.ghostBtnMd}>
            관계 네트워크
          </Link>
          <button type="button" disabled title={DISABLED_REASON} className={s.ghostBtnMd}>
            신뢰도 배치 (준비중)
          </button>
          <button type="button" onClick={refresh} disabled={pending} className={s.primaryBtnMd}>
            {pending ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {error && <div className={s.alert}>{error}</div>}

      <section className={s.filterBar}>
        <select value={role} onChange={(e) => setRole(e.target.value as TrustRole | '')} className={s.input}>
          <option value="">역할 전체</option>
          <option value="restaurant">식당</option>
          <option value="supplier">공급자</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value ? parseInt(e.target.value, 10) : '')} className={s.input}>
          <option value="">Level 전체</option>
          <option value="0">Normal</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
        </select>
        <input value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} className={s.input} placeholder="score min" />
        <input value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} className={s.input} placeholder="score max" />
        <button type="button" onClick={refresh} disabled={pending} className={s.ghostBtnMd}>
          필터 적용
        </button>
      </section>

      <section className={s.panel}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>참여자 목록</h2>
          <div className={s.inlineMuted}>총 {filtered.length}명</div>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty}>표시할 참여자가 없습니다.</div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr className={s.theadRow}>
                  {['role', 'tenant', 'score', 'level', 'updated_at', 'actions'].map((h) => (
                    <th key={h} className={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.role}:${r.tenant_id}`}>
                    <td className={s.td}>{r.role}</td>
                    <td className={s.td}>
                      <div className={s.cellStrong}>{r.tenant_name ?? r.tenant_id.slice(0, 8) + '…'}</div>
                      <div className={s.cellMutedSm}>{r.tenant_id}</div>
                    </td>
                    <td className={s.td}>{r.score}</td>
                    <td className={s.td}>
                      <span className={levelBadgeClass(r.level)}>{levelLabel(r.level)}</span>
                    </td>
                    <td className={s.tdNowrap}>{fmtDate(r.updated_at)}</td>
                    <td className={s.tdNowrap}>
                      <div className={s.actionsRow}>
                        <Link href={`/admin/participants/${r.tenant_id}?role=${r.role}`} className={s.ghostBtn}>
                          상세
                        </Link>
                        <button type="button" className={s.ghostBtn} onClick={() => recalc(r.tenant_id, r.role)} disabled={pending}>
                          계산
                        </button>
                        <button type="button" className={s.primaryBtn} disabled title={DISABLED_REASON}>
                          적용 (준비중)
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

