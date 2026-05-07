'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { calculateTrustScore, getParticipants, updateTrustScore, type ParticipantRow, type TrustRole } from '@/actions/admin/trust-engine'

function badgeLevel(level: number) {
  if (level >= 3) return { bg: '#FEE2E2', color: '#B91C1C', label: 'Level 3' }
  if (level === 2) return { bg: '#FFEDD5', color: '#9A3412', label: 'Level 2' }
  if (level === 1) return { bg: '#FEF9C3', color: '#A16207', label: 'Level 1' }
  return { bg: '#F3F4F6', color: '#374151', label: 'Normal' }
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
      if (!res.success) { setError(res.error ?? '조회 실패'); return }
      setRows(res.data ?? [])
    })
  }

  async function recalc(tenant_id: string, r: TrustRole) {
    setError(null)
    startTransition(async () => {
      const res = await calculateTrustScore(tenant_id, r)
      if (!res.success || !res.data) { setError(res.error ?? '계산 실패'); return }
      alert(`계산 결과: score=${res.data.score}, level=${res.data.level}`)
    })
  }

  async function apply(tenant_id: string, r: TrustRole) {
    if (!confirm('신뢰도를 업데이트하시겠습니까? (Level 3이면 Action Queue가 생성될 수 있습니다)')) return
    setError(null)
    startTransition(async () => {
      const res = await updateTrustScore(tenant_id, r)
      if (!res.success || !res.data) { setError(res.error ?? '업데이트 실패'); return }
      refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>참여자 네트워크</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
            신뢰도 계산 → Level(0~3) → 정책/개입 → Action Queue
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/participants/relationships" style={ghostBtn}>관계 네트워크</Link>
          <button type="button" onClick={refresh} disabled={pending} style={primaryBtn}>
            {pending ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
          {error}
        </div>
      )}

      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={role} onChange={(e) => setRole(e.target.value as any)} style={inp}>
          <option value="">역할 전체</option>
          <option value="restaurant">식당</option>
          <option value="supplier">공급자</option>
        </select>
        <select value={level === '' ? '' : String(level)} onChange={(e) => setLevel(e.target.value ? parseInt(e.target.value, 10) : '')} style={inp}>
          <option value="">Level 전체</option>
          <option value="3">Level 3</option>
          <option value="2">Level 2</option>
          <option value="1">Level 1</option>
          <option value="0">Normal</option>
        </select>
        <input value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} placeholder="score min" style={inp} />
        <input value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} placeholder="score max" style={inp} />
        <button type="button" onClick={refresh} disabled={pending} style={ghostBtn}>
          필터 적용
        </button>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>전체 참여자</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>총 {filtered.length}명</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['역할', '참여자', 'score', 'level', 'cooldown', 'updated_at', ''].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const b = badgeLevel(r.level)
                return (
                  <tr key={`${r.role}:${r.tenant_id}`}>
                    <td style={td}>{r.role === 'supplier' ? '공급자' : '식당'}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 900, color: '#111827' }}>{r.tenant_name ?? r.tenant_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{r.tenant_id}</div>
                    </td>
                    <td style={td}>{r.score}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: b.bg, color: b.color, fontSize: 11, fontWeight: 900 }}>
                        {b.label}
                      </span>
                    </td>
                    <td style={td}>{r.cooldown_until ?? '-'}</td>
                    <td style={td}>{fmtDate(r.updated_at)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => recalc(r.tenant_id, r.role)} disabled={pending} style={ghostBtnSm}>재계산</button>
                        <button type="button" onClick={() => apply(r.tenant_id, r.role)} disabled={pending} style={primaryBtnSm}>적용</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td style={td} colSpan={7}>데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13 }

const primaryBtn: React.CSSProperties = { padding: '9px 14px', border: 'none', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '9px 14px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#111827', fontSize: 13, fontWeight: 900, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const primaryBtnSm: React.CSSProperties = { padding: '6px 10px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer' }
const ghostBtnSm: React.CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#111827', fontSize: 12, fontWeight: 900, cursor: 'pointer' }

