'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { getRelationships } from '@/actions/admin/trust-engine'
import s from '../../admin-shared.module.css'

function scoreBadgeClass(score: number) {
  if (score <= 40) return s.badgeScoreLow
  if (score <= 60) return s.badgeScoreMid
  if (score <= 80) return s.badgeScoreBlue
  return s.badgeScoreOk
}

export default function RelationshipsClient({
  initial,
  initialError,
}: {
  initial: Array<{
    id: string
    restaurant_tenant_id: string
    supplier_tenant_id: string
    restaurant_name: string | null
    supplier_name: string | null
    trust_score: number
    relationship_status: string
    cooldown_until: string | null
    created_at: string | null
  }>
  initialError: string | null
}) {
  const [rows, setRows] = useState(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [status, setStatus] = useState('')
  const [scoreMin, setScoreMin] = useState('')
  const [scoreMax, setScoreMax] = useState('')
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status && r.relationship_status !== status) return false
      const min = scoreMin.trim() ? parseInt(scoreMin, 10) : null
      const max = scoreMax.trim() ? parseInt(scoreMax, 10) : null
      if (min != null && !Number.isNaN(min) && r.trust_score < min) return false
      if (max != null && !Number.isNaN(max) && r.trust_score > max) return false
      return true
    })
  }, [rows, status, scoreMin, scoreMax])

  function refresh() {
    setError(null)
    startTransition(async () => {
      const res = await getRelationships({
        status: status || undefined,
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

  return (
    <div className={s.stackCol}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>관계 네트워크</h1>
          <p className={s.subtitle}>식당 ↔ 공급자 관계 단위 신뢰도 (relationships)</p>
        </div>
        <div className={s.actionsRow}>
          <Link href="/admin/participants" className={s.ghostBtnMd}>
            참여자
          </Link>
          <button type="button" onClick={refresh} disabled={pending} className={s.primaryBtnMd}>
            {pending ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {error && <div className={s.alert}>{error}</div>}

      <section className={s.filterBar}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={s.input}>
          <option value="">상태 전체</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="cooldown">cooldown</option>
        </select>
        <input value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} placeholder="score min" className={s.input} />
        <input value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} placeholder="score max" className={s.input} />
        <button type="button" onClick={refresh} disabled={pending} className={s.ghostBtnMd}>
          필터 적용
        </button>
      </section>

      <section className={s.panel}>
        <div className={s.sectionListHead}>
          <div className={s.sectionListTitle}>식당↔공급자 관계</div>
          <div className={s.inlineMuted}>총 {filtered.length}건</div>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                {['식당', '공급자', 'status', 'trust_score', 'cooldown', 'created_at'].map((h) => (
                  <th key={h} className={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className={s.td}>
                    <div className={s.cellStrong}>{r.restaurant_name ?? r.restaurant_tenant_id.slice(0, 8)}</div>
                    <div className={s.cellMutedXs}>{r.restaurant_tenant_id}</div>
                  </td>
                  <td className={s.td}>
                    <div className={s.cellStrong}>{r.supplier_name ?? r.supplier_tenant_id.slice(0, 8)}</div>
                    <div className={s.cellMutedXs}>{r.supplier_tenant_id}</div>
                  </td>
                  <td className={s.td}>{r.relationship_status}</td>
                  <td className={s.td}>
                    <span className={scoreBadgeClass(r.trust_score)}>{r.trust_score}</span>
                  </td>
                  <td className={s.td}>{r.cooldown_until ?? '-'}</td>
                  <td className={s.td}>{r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className={s.td} colSpan={6}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
