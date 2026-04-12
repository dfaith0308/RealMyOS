'use client'

import { useState } from 'react'
import { createContactLog } from '@/actions/contact'
import type { OutcomeType, CustomerStatus } from '@/actions/contact'

// ============================================================
// 상수
// ============================================================

const OUTCOME_TYPES: { value: OutcomeType; label: string; color: string }[] = [
  { value: 'interested',         label: '관심있음',    color: '#16A34A' },
  { value: 'potential',          label: '잠재고객',    color: '#2563EB' },
  { value: 'maintained',         label: '유지',        color: '#6b7280' },
  { value: 'churn_risk',         label: '이탈위험',    color: '#DC2626' },
  { value: 'competitor',         label: '경쟁사이용',  color: '#7C3AED' },
  { value: 'rejected',           label: '거절',        color: '#EF4444' },
  { value: 'no_answer',          label: '부재중',      color: '#9ca3af' },
  { value: 'callback_requested', label: '콜백요청',    color: '#D97706' },
  { value: 'order_placed',       label: '주문완료',    color: '#059669' },
]

const CUSTOMER_STATUS: { value: CustomerStatus; label: string }[] = [
  { value: 'regular', label: '단골' },
  { value: 'new',     label: '신규' },
  { value: 'churn',   label: '이탈' },
  { value: 'dormant', label: '휴면' },
]

const METHODS = [
  { value: 'call',    label: '📞 전화' },
  { value: 'message', label: '💬 문자' },
  { value: 'kakao',   label: '🟡 카카오' },
]

// next_action_date 자동 계산
function calcNextActionDate(outcome: OutcomeType | '', avgCycle: number): string {
  const cycle = Math.max(1, avgCycle || 7)

  const multiplierMap: Partial<Record<OutcomeType, number>> = {
    interested:         0.3,
    potential:          0.5,
    maintained:         0.8,
    churn_risk:         0.2,
    competitor:         1.5,
    rejected:           2.0,
    order_placed:       0.9,
  }
  const FIXED_2DAYS = new Set<OutcomeType>(['no_answer', 'callback_requested'])

  let addDays: number
  if (!outcome) {
    addDays = 7
  } else if (FIXED_2DAYS.has(outcome)) {
    addDays = 2
  } else {
    const mult = multiplierMap[outcome] ?? 1
    addDays = Math.max(1, Math.round(cycle * mult))
  }

  const d = new Date(Date.now() + 9 * 3600000)
  d.setDate(d.getDate() + addDays)
  return d.toISOString().slice(0, 10)
}

// ============================================================
// Props
// ============================================================

interface QuickActionButtonProps {
  customerId:    string
  customerName:  string
  phone?:        string | null
  avgOrderCycle?: number
  compact?:      boolean
  scheduleId?:   string | null  // 스케줄 연결
  onDone?:       () => void
  _forceOpen?:   boolean
}

// ============================================================
// 컴포넌트
// ============================================================

export default function QuickActionButton({
  customerId, customerName, phone, avgOrderCycle = 14, compact = false,
}: QuickActionButtonProps) {
  const cycle = avgOrderCycle ?? 7
  const [open,           setOpen]           = useState(false)
  const [methods,        setMethods]        = useState<string[]>(['call'])
  const [outcome,        setOutcome]        = useState<OutcomeType | ''>('')
  const [memo,           setMemo]           = useState('')
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus | ''>('')
  const [nextDate,       setNextDate]       = useState(calcNextActionDate('', cycle))
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [done,           setDone]           = useState(false)

  function reset() {
    setMethods(['call']); setOutcome('')
    setCustomerStatus(''); setNextDate(calcNextActionDate('', avgOrderCycle))
    setSaving(false); setError(''); setDone(false)
  }

  function handleOpen() { setOpen(true); reset() }
  function handleClose() { setOpen(false); reset() }

  function toggleMethod(m: string) {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  function handleOutcomeChange(v: OutcomeType) {
    setOutcome(v)
    setNextDate(calcNextActionDate(v, cycle))  // 자동 재계산
  }

  // 유효성 검사
  function validate(): string {
    if (!methods || methods.length === 0) return '행동을 1개 이상 선택해주세요.'
    if (!outcome)               return '결과를 선택해주세요.'
    if (!memo.trim())           return '메모를 입력해주세요. (필수)'
    return ''
  }

  async function handleSave() {
    const err = validate()
    if (err) { setError(err); return }
    if (saving) return

    console.log('[QuickAction SAVE]', { outcome, memo: memo.trim(), methods, nextDate })
    setSaving(true); setError('')

    // 전화 다이얼 — 전화 선택 시
    if (methods.includes('call') && phone) {
      window.location.href = `tel:${phone}`
    }

    const res = await createContactLog({
      customer_id:     customerId,
      contact_method:  (() => {
        const first = methods[0] ?? 'call'
        return (first === 'sms' || first === 'kakao' ? 'message' : first) as any
      })(),
      methods,
      outcome_type:    outcome as OutcomeType,
      customer_status: customerStatus || undefined,
      next_action_date: nextDate || undefined,
      next_action_type: 'call',
      memo:            memo.trim(),
      schedule_id:     scheduleId ?? null,
    })

    if (!res.success) {
      setError(res.error ?? '저장 실패')
      setSaving(false)
      return
    }

    setDone(true)
    setTimeout(() => { handleClose(); onDone?.() }, 1000)
  }

  // ── 렌더 ────────────────────────────────────────────────

  if (!open && !_forceOpen) {
    return (
      <button onClick={handleOpen}
        style={{ padding: compact ? '4px 10px' : '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: compact ? 11 : 13, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}>
        🎯 {compact ? '영업' : '영업 실행'}
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🎯 영업 기록</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{customerName}{phone && ` · ${phone}`}</div>
          </div>
          <button onClick={handleClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#16A34A', fontSize: 15, fontWeight: 600 }}>✅ 영업 기록 저장 완료</div>
        ) : (
          <>
            {/* 1. 행동 선택 (복수) */}
            <div>
              <div style={labelStyle}>1. 행동 선택 (복수 가능)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {METHODS.map(m => (
                  <button key={m.value} onClick={() => toggleMethod(m.value)}
                    style={{ flex: 1, padding: '9px 0', border: `2px solid ${methods.includes(m.value) ? '#111827' : '#e5e7eb'}`, borderRadius: 8, background: methods.includes(m.value) ? '#111827' : '#fff', color: methods.includes(m.value) ? '#fff' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: methods.includes(m.value) ? 600 : 400 }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 결과 선택 (필수) */}
            <div>
              <div style={labelStyle}>2. 결과 선택 <span style={{ color: '#DC2626' }}>*</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OUTCOME_TYPES.map(o => (
                  <button key={o.value} onClick={() => handleOutcomeChange(o.value)}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: outcome === o.value ? 600 : 400, background: outcome === o.value ? o.color : '#f3f4f6', color: outcome === o.value ? '#fff' : '#374151' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 메모 (필수) */}
            <div>
              <div style={labelStyle}>3. 메모 <span style={{ color: '#DC2626' }}>*</span></div>
              <textarea
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${!memo && error ? '#EF4444' : '#e5e7eb'}`, borderRadius: 8, fontSize: 13, resize: 'vertical', minHeight: 72, boxSizing: 'border-box', lineHeight: 1.5 }}
                placeholder="통화 내용, 고객 반응, 특이사항 등 (필수 입력)"
                value={memo}
                onChange={e => setMemo(e.target.value)} />
            </div>

            {/* 4. 고객 상태 */}
            <div>
              <div style={labelStyle}>4. 고객 상태 (선택)</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {CUSTOMER_STATUS.map(s => (
                  <button key={s.value} onClick={() => setCustomerStatus(prev => prev === s.value ? '' : s.value)}
                    style={{ flex: 1, padding: '7px 0', border: `1px solid ${customerStatus === s.value ? '#111827' : '#e5e7eb'}`, borderRadius: 7, background: customerStatus === s.value ? '#111827' : '#fff', color: customerStatus === s.value ? '#fff' : '#374151', fontSize: 12, cursor: 'pointer', fontWeight: customerStatus === s.value ? 600 : 400 }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. 다음 행동 날짜 */}
            <div>
              <div style={labelStyle}>5. 다음 행동 날짜
                {outcome && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>결과 기반 자동 계산됨</span>}
              </div>
              <input type="date"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                value={nextDate}
                onChange={e => setNextDate(e.target.value)} />
            </div>

            {/* 에러 */}
            {error && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* 저장 버튼 */}
            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', padding: '12px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? '저장 중...' : '영업 기록 저장'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#374151',
  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
}
