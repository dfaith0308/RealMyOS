'use client'

import { useState } from 'react'
import { deleteContactLog, updateContactLog } from '@/actions/sales'
import QuickActionButton from '@/components/sales/QuickActionButton'
import type { SalesHistory, ConversionStats } from '@/actions/sales'

// ============================================================
// 상수
// ============================================================

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

const METHOD_ICON: Record<string, string> = {
  call: '📞', message: '💬', visit: '🚗', kakao: '🟡',
}

const PREFERRED_TIME: Record<string, string> = {
  morning: '오전', afternoon: '오후', evening: '저녁',
}

// ============================================================
// Props
// ============================================================

interface CustomerSalesClientProps {
  customer: {
    id:                       string
    name:                     string
    phone:                    string | null
    preferred_contact_method: string | null
    preferred_contact_time:   string | null
    last_contact_date:        string | null
    last_contact_outcome:     string | null
    sales_status:             string | null
  }
  initialHistory: SalesHistory[]
  nextAction:     { date: string; type: string } | null
  conversionStats: ConversionStats | null
}

// ============================================================
// 인라인 수정 폼
// ============================================================

function EditModal({ log, onSave, onClose }: {
  log:     SalesHistory
  onSave:  (updated: Partial<SalesHistory>) => void
  onClose: () => void
}) {
  const [outcome,  setOutcome]  = useState(log.outcome_type ?? '')
  const [memo,     setMemo]     = useState(log.memo ?? '')
  const [nextDate, setNextDate] = useState(log.next_action_date ?? '')
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    setSaving(true)
    const data: Record<string, string | undefined> = {}
    if (outcome)  data.outcome_type     = outcome
    if (memo)     data.memo             = memo
    if (nextDate) data.next_action_date = nextDate
    await updateContactLog(log.id, data)
    onSave({ outcome_type: outcome || null, memo: memo || null, next_action_date: nextDate || null })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 700 }}>이력 수정</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>결과</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
              <button key={k} onClick={() => setOutcome(k)}
                style={{ padding: '4px 10px', border: 'none', borderRadius: 20, fontSize: 11, cursor: 'pointer', background: outcome === k ? v.color : '#f3f4f6', color: outcome === k ? '#fff' : '#374151' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <textarea style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, minHeight: 64, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
          value={memo} onChange={e => setMemo(e.target.value)} placeholder="메모" />
        <input type="date" style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', marginBottom: 14 }}
          value={nextDate} onChange={e => setNextDate(e.target.value)} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '9px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function CustomerSalesClient({ customer, initialHistory, nextAction, conversionStats }: CustomerSalesClientProps) {
  const [history,    setHistory]    = useState(initialHistory)
  const [editTarget, setEditTarget] = useState<SalesHistory | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const lastLog     = history[0] ?? null
  const lastOutcome = lastLog?.outcome_type ? OUTCOME_LABEL[lastLog.outcome_type] : null

  async function handleDelete(id: string) {
    if (!confirm('이 영업 기록을 삭제하시겠습니까?')) return
    setDeletingId(id)
    await deleteContactLog(id)
    setHistory(prev => prev.filter(h => h.id !== id))
    setDeletingId(null)
  }

  function handleEditSave(id: string, updated: Partial<SalesHistory>) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, ...updated } : h))
  }

  return (
    <>
      {/* ── 상단 요약 카드 ── */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 20, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          {/* 거래처 정보 */}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{customer.name}</h1>
            <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#6b7280', flexWrap: 'wrap' }}>
              {customer.phone && <span>📞 {customer.phone}</span>}
              {customer.preferred_contact_method && (
                <span>선호채널: {METHOD_ICON[customer.preferred_contact_method]} {customer.preferred_contact_method}</span>
              )}
              {customer.preferred_contact_time && (
                <span>선호시간: {PREFERRED_TIME[customer.preferred_contact_time]}</span>
              )}
            </div>
          </div>

          {/* 영업 실행 버튼 */}
          <QuickActionButton
            customerId={customer.id}
            customerName={customer.name}
            phone={customer.phone}
          />
        </div>

        {/* 요약 지표 */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            {
              label: '마지막 연락',
              value: customer.last_contact_date
                ? customer.last_contact_date.slice(0, 10)
                : '없음',
            },
            {
              label: '마지막 결과',
              value: customer.last_contact_outcome
                ? (OUTCOME_LABEL[customer.last_contact_outcome]?.label ?? customer.last_contact_outcome)
                : '없음',
              color: customer.last_contact_outcome
                ? OUTCOME_LABEL[customer.last_contact_outcome]?.color
                : undefined,
            },
            {
              label: '다음 행동',
              value: nextAction ? `${nextAction.date} ${METHOD_ICON[nextAction.type] ?? ''}` : '미정',
              color: nextAction ? '#D97706' : undefined,
            },
            {
              label: '고객 상태',
              value: customer.sales_status ?? '미분류',
            },
            ...(conversionStats ? [{
              label: '주문 전환율',
              value: conversionStats.total_attempts === 0
                ? '-'
                : `${conversionStats.conversion_rate}% (${conversionStats.conversions}/${conversionStats.total_attempts})`,
              color: conversionStats.conversion_rate >= 50 ? '#16A34A'
                   : conversionStats.conversion_rate > 0  ? '#D97706'
                   : '#9ca3af',
            }] : []),
          ].map(item => (
            <div key={item.label} style={{ minWidth: 100, background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: item.color ?? '#111827' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 영업이력 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>영업이력</h2>
        <a href="/sales/history" style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none' }}>전체보기 →</a>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', border: '1px dashed #e5e7eb', borderRadius: 10, fontSize: 14 }}>
          영업 기록이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map(h => {
            const outcomeInfo = h.outcome_type ? OUTCOME_LABEL[h.outcome_type] : null
            const isDeleting  = deletingId === h.id
            return (
              <div key={h.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', background: '#fff', opacity: isDeleting ? 0.4 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: h.memo ? 8 : 0 }}>
                  {/* 왼쪽 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {h.methods && h.methods.length > 0
                        ? h.methods.map((m, i) => <span key={i} style={{ fontSize: 15 }}>{METHOD_ICON[m] ?? m}</span>)
                        : <span style={{ fontSize: 15 }}>{METHOD_ICON[h.contact_method] ?? h.contact_method}</span>
                      }
                    </div>
                    {outcomeInfo && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: outcomeInfo.color + '20', color: outcomeInfo.color, fontWeight: 600 }}>
                        {outcomeInfo.label}
                      </span>
                    )}
                    {h.schedule_id && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#ECFDF5', color: '#059669' }}>📅 스케줄</span>
                    )}
                    {h.outcome_type === 'order_placed' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F0FDF4', color: '#16A34A', fontWeight: 600 }}>🟢 주문발생</span>
                    )}
                  </div>

                  {/* 오른쪽 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      {(h.created_at || h.contacted_at).slice(0, 16).replace('T', ' ')}
                    </span>
                    <button onClick={() => setEditTarget(h)}
                      style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#2563EB' }}>
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(h.id)} disabled={isDeleting}
                      style={{ padding: '2px 8px', border: '1px solid #FECACA', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#DC2626' }}>
                      🗑
                    </button>
                  </div>
                </div>

                {h.memo && (
                  <div style={{ fontSize: 13, color: '#374151', background: '#f9fafb', borderRadius: 6, padding: '7px 10px', lineHeight: 1.5 }}>
                    {h.memo}
                  </div>
                )}

                {h.next_action_date && (
                  <div style={{ fontSize: 11, color: '#D97706', marginTop: 6 }}>
                    📅 다음: {h.next_action_date} {h.next_action_type ? METHOD_ICON[h.next_action_type] ?? '' : ''}
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
          onSave={updated => { handleEditSave(editTarget.id, updated); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}
    </>
  )
}
