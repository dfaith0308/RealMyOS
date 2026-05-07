'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { deleteContactLog, updateContactLog } from '@/actions/sales'
import type { SalesHistory } from '@/actions/sales'

const OUTCOME_LABEL: Record<string, { label: string; color: string }> = {
  interested:         { label: '관심있음',   color: '#16A34A' },
  potential:          { label: '잠재고객',   color: '#2563EB' },
  maintained:         { label: '유지',       color: '#6b7280' },
  churn_risk:         { label: '이탈위험',   color: '#DC2626' },
  competitor:         { label: '경쟁사이용', color: '#7C3AED' },
  rejected:           { label: '거절',       color: '#EF4444' },
  no_answer:          { label: '부재중',     color: '#9ca3af' },
  callback_requested: { label: '콜백요청',   color: '#D97706' },
  order_placed:       { label: '주문완료',   color: '#059669' },
}

const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  regular: '단골', new: '신규', churn: '이탈', dormant: '휴면',
}

const METHOD_ICON: Record<string, string> = {
  call: '📞', message: '💬', visit: '🚗', kakao: '🟡', sms: '💬',
}

// 수정 모달
function EditModal({ log, onSave, onClose }: {
  log: SalesHistory
  onSave: (updated: Partial<SalesHistory>) => void
  onClose: () => void
}) {
  const [outcome,     setOutcome]    = useState(log.outcome_type ?? '')
  const [memo,        setMemo]       = useState(log.memo ?? '')
  const [nextDate,    setNextDate]   = useState(log.next_action_date ?? '')
  const [custStatus,  setCustStatus] = useState(log.customer_status ?? '')
  const [saving,      setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    const data: Record<string, string | undefined> = {}
    if (outcome)   data.outcome_type    = outcome
    if (memo)      data.memo            = memo
    if (nextDate)  data.next_action_date = nextDate
    if (custStatus) data.customer_status = custStatus

    const res = await updateContactLog(log.id, data)
    if (res.success) {
      onSave({ outcome_type: outcome || null, memo: memo || null, next_action_date: nextDate || null, customer_status: custStatus || null })
    }
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>이력 수정</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>결과</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
              <button key={k} onClick={() => setOutcome(k)}
                style={{ padding: '4px 10px', border: 'none', borderRadius: 20, fontSize: 11, cursor: 'pointer', background: outcome === k ? v.color : '#f3f4f6', color: outcome === k ? '#fff' : '#374151', fontWeight: outcome === k ? 600 : 400 }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>메모</div>
          <textarea style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, minHeight: 72, resize: 'vertical', boxSizing: 'border-box' }}
            value={memo} onChange={e => setMemo(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>다음 날짜</div>
            <input type="date" style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
              value={nextDate} onChange={e => setNextDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>고객 상태</div>
            <select style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
              value={custStatus} onChange={e => setCustStatus(e.target.value)}>
              <option value="">-</option>
              {Object.entries(CUSTOMER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '9px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 메인
export default function SalesHistoryClient({ initialHistory }: { initialHistory: SalesHistory[] }) {
  const [history,       setHistory]       = useState(initialHistory)
  const [search,        setSearch]        = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [converted,     setConverted]     = useState<'all' | 'yes' | 'no'>('all')
  const [editTarget,    setEditTarget]    = useState<SalesHistory | null>(null)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)

  const filtered = useMemo(() => {
    return history.filter((h) => {
      const day = (h.next_action_date ?? h.contacted_at ?? h.created_at ?? '').slice(0, 10)
      const matchSearch  = !search || h.customer_name.includes(search)
      const matchOutcome = !filterOutcome || h.outcome_type === filterOutcome
      const matchFrom    = !dateFrom || day >= dateFrom
      const matchTo      = !dateTo || day <= dateTo
      const hasOrder     = !!h.converted_order_id
      const matchConv =
        converted === 'all'
          ? true
          : converted === 'yes'
            ? hasOrder
            : !hasOrder
      return matchSearch && matchOutcome && matchFrom && matchTo && matchConv
    })
  }, [history, search, filterOutcome, dateFrom, dateTo, converted])

  async function handleDelete(id: string) {
    if (!confirm('이 영업 기록을 삭제하시겠습니까?')) return
    setDeletingId(id)
    const res = await deleteContactLog(id)
    if (res.success) setHistory(prev => prev.filter(h => h.id !== id))
    setDeletingId(null)
  }

  function handleEditSave(id: string, updated: Partial<SalesHistory>) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, ...updated } : h))
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system, "Noto Sans KR", sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>영업 이력</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 180 }}
            placeholder="거래처명 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
            value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}>
            <option value="">전체 결과</option>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          <select value={converted} onChange={(e) => setConverted(e.target.value as any)}
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="all">주문발생 전체</option>
            <option value="yes">발생</option>
            <option value="no">미발생</option>
          </select>
        </div>
      </div>

      {/* 테이블 헤더 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1.2fr 90px 120px 110px 90px 120px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          {['날짜', '거래처', '행동', '결과코드', '다음행동일', '담당자', '주문발생여부'].map((h) => (
            <div key={h} style={{ padding: '10px 10px', fontSize: 11, fontWeight: 900, color: '#6b7280' }}>{h}</div>
          ))}
        </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14 }}>
          영업 기록이 없습니다.
        </div>
      ) : (
        filtered.map((h) => {
          const outcomeInfo = h.outcome_type ? OUTCOME_LABEL[h.outcome_type] : null
          const isDeleting  = deletingId === h.id
          const day = (h.contacted_at || h.created_at).slice(0, 10)
          const method = h.contact_method
          const methodLabel = method === 'call' ? '전화' : method === 'message' ? '문자' : method === 'visit' ? '방문' : method
          const owner = h.contacted_by ? h.contacted_by.slice(0, 8) : '-'
          return (
            <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '110px 1.2fr 90px 120px 110px 90px 120px', borderBottom: '1px solid #f3f4f6', alignItems: 'center', opacity: isDeleting ? 0.4 : 1 }}>
              <div style={{ padding: '10px 10px', fontSize: 12, color: '#6b7280' }}>{day}</div>
              <div style={{ padding: '10px 10px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{h.customer_name}</div>
                {h.memo && <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.memo}</div>}
              </div>
              <div style={{ padding: '10px 10px', fontSize: 12, color: '#111827' }}>
                {METHOD_ICON[method] ?? ''} {methodLabel}
              </div>
              <div style={{ padding: '10px 10px' }}>
                {outcomeInfo ? (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: outcomeInfo.color + '20', color: outcomeInfo.color, fontWeight: 800 }}>
                    {outcomeInfo.label}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                )}
              </div>
              <div style={{ padding: '10px 10px', fontSize: 12, color: '#D97706' }}>{h.next_action_date ?? '-'}</div>
              <div style={{ padding: '10px 10px', fontSize: 12, color: '#6b7280' }}>{owner}</div>
              <div style={{ padding: '10px 10px', fontSize: 12 }}>
                {h.converted_order_id ? (
                  <Link href={`/orders/${encodeURIComponent(h.converted_order_id)}`} style={{ color: '#16A34A', fontWeight: 900, textDecoration: 'none' }}>
                    주문발생 ✅
                  </Link>
                ) : (
                  <span style={{ color: '#9ca3af' }}>-</span>
                )}
              </div>
            </div>
          )
        })
      )}
      </div>

      {/* 수정 모달 */}
      {editTarget && (
        <EditModal
          log={editTarget}
          onSave={(updated) => { handleEditSave(editTarget.id, updated); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
