'use client'

import { useState } from 'react'
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
  call: '📞', message: '💬', visit: '🚗', kakao: '🟡', sms: '💬', call_attempt: '📞',
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
  const [editTarget,    setEditTarget]    = useState<SalesHistory | null>(null)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)

  const filtered = history.filter(h => {
    const matchSearch  = !search || h.customer_name.includes(search)
    const matchOutcome = !filterOutcome || h.outcome_type === filterOutcome
    return matchSearch && matchOutcome
  })

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
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, width: 180 }}
            placeholder="거래처명 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
            value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}>
            <option value="">전체 결과</option>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 0', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          영업 기록이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(h => {
            const outcomeInfo = h.outcome_type ? OUTCOME_LABEL[h.outcome_type] : null
            const isDeleting  = deletingId === h.id
            return (
              <div key={h.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', background: '#fff', opacity: isDeleting ? 0.4 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: h.memo ? 10 : 0 }}>
                  {/* 왼쪽 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{h.customer_name}</span>

                    {/* 행동 아이콘 */}
                    <div style={{ display: 'flex', gap: 3 }}>
                      {h.methods && h.methods.length > 0
                        ? h.methods.map((m, i) => <span key={i} style={{ fontSize: 15 }}>{METHOD_ICON[m] ?? m}</span>)
                        : <span style={{ fontSize: 15 }}>{METHOD_ICON[h.contact_method] ?? h.contact_method}</span>
                      }
                    </div>

                    {/* outcome */}
                    {outcomeInfo && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: outcomeInfo.color + '20', color: outcomeInfo.color, fontWeight: 600 }}>
                        {outcomeInfo.label}
                      </span>
                    )}

                    {/* 고객 상태 */}
                    {h.customer_status && (
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>
                        {CUSTOMER_STATUS_LABEL[h.customer_status] ?? h.customer_status}
                      </span>
                    )}
                  </div>

                  {/* 오른쪽: 날짜 + 버튼 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      {(h.created_at || h.contacted_at).slice(0, 16).replace('T', ' ')}
                    </span>
                    <button onClick={() => setEditTarget(h)}
                      style={{ padding: '3px 9px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#2563EB' }}>
                      ✏️ 수정
                    </button>
                    <button onClick={() => handleDelete(h.id)} disabled={isDeleting}
                      style={{ padding: '3px 9px', border: '1px solid #FECACA', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
                      🗑 삭제
                    </button>
                  </div>
                </div>

                {/* 메모 */}
                {h.memo && (
                  <div style={{ fontSize: 13, color: '#374151', background: '#f9fafb', borderRadius: 7, padding: '8px 10px', lineHeight: 1.6 }}>
                    {h.memo}
                  </div>
                )}

                {/* 다음 행동 */}
                {h.next_action_date && (
                  <div style={{ fontSize: 11, color: '#D97706', marginTop: 8 }}>
                    📅 다음: {h.next_action_date}
                    {h.next_action_type && ` (${METHOD_ICON[h.next_action_type] ?? h.next_action_type})`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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