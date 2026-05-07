'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { getRelationships } from '@/actions/admin/trust-engine'

function badgeScore(score: number) {
  if (score <= 40) return { bg: '#FEE2E2', color: '#B91C1C' }
  if (score <= 60) return { bg: '#FFEDD5', color: '#9A3412' }
  if (score <= 80) return { bg: '#DBEAFE', color: '#1D4ED8' }
  return { bg: '#ECFDF5', color: '#047857' }
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
      if (!res.success) { setError(res.error ?? '조회 실패'); return }
      setRows(res.data ?? [])
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>관계 네트워크</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
            식당 ↔ 공급자 관계 단위 신뢰도 (relationships)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/participants" style={ghostBtn}>참여자</Link>
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inp}>
          <option value="">상태 전체</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="cooldown">cooldown</option>
        </select>
        <input value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} placeholder="score min" style={inp} />
        <input value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} placeholder="score max" style={inp} />
        <button type="button" onClick={refresh} disabled={pending} style={ghostBtn}>필터 적용</button>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>식당↔공급자 관계</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>총 {filtered.length}건</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['식당', '공급자', 'status', 'trust_score', 'cooldown', 'created_at'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const b = badgeScore(r.trust_score)
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>{r.restaurant_name ?? r.restaurant_tenant_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{r.restaurant_tenant_id}</div>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 900 }}>{r.supplier_name ?? r.supplier_tenant_id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{r.supplier_tenant_id}</div>
                    </td>
                    <td style={td}>{r.relationship_status}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: b.bg, color: b.color, fontSize: 11, fontWeight: 900 }}>
                        {r.trust_score}
                      </span>
                    </td>
                    <td style={td}>{r.cooldown_until ?? '-'}</td>
                    <td style={td}>{r.created_at ? String(r.created_at).slice(0, 16).replace('T', ' ') : '-'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td style={td} colSpan={6}>데이터가 없습니다.</td></tr>
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

