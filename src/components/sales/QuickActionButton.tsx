'use client'

// ============================================================
// QuickActionButton — Client Component
// Server Action: createContactLog만 호출
// updateScheduleStatus는 onDone() 콜백으로 부모가 처리
// ============================================================

import { useState, useEffect } from 'react'
import { createContactLog } from '@/actions/contact'
import { normalizeContactMethod } from '@/lib/contact-utils'

// 타입은 서버 파일에서 가져오지 않고 로컬 정의
type OutcomeType =
  | 'interested' | 'potential' | 'maintained' | 'churn_risk'
  | 'competitor' | 'rejected' | 'no_answer' | 'callback_requested' | 'order_placed'

type CustomerStatus = 'regular' | 'new' | 'churn' | 'dormant'

// ── 상수 ────────────────────────────────────────────────────

const OUTCOME_TYPES: { value: OutcomeType; label: string; color: string }[] = [
  { value: 'interested',         label: '관심있음',   color: '#16A34A' },
  { value: 'potential',          label: '잠재고객',   color: '#2563EB' },
  { value: 'maintained',         label: '유지',       color: '#6b7280' },
  { value: 'churn_risk',         label: '이탈위험',   color: '#DC2626' },
  { value: 'competitor',         label: '경쟁사이용', color: '#7C3AED' },
  { value: 'rejected',           label: '거절',       color: '#EF4444' },
  { value: 'no_answer',          label: '부재중',     color: '#9ca3af' },
  { value: 'callback_requested', label: '콜백요청',   color: '#D97706' },
  { value: 'order_placed',       label: '주문완료',   color: '#059669' },
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

// ── 유틸 ────────────────────────────────────────────────────

function calcNextActionDate(outcome: OutcomeType | '', avgCycle: number): string {
  const cycle = Math.max(1, avgCycle || 7)
  const m: Partial<Record<OutcomeType, number>> = {
    interested: 0.3, potential: 0.5, maintained: 0.8,
    churn_risk: 0.2, competitor: 1.5, rejected:   2.0, order_placed: 0.9,
  }
  const fixed2 = new Set<OutcomeType>(['no_answer', 'callback_requested'])
  const days = !outcome ? 7 : fixed2.has(outcome) ? 2 : Math.max(1, Math.round(cycle * (m[outcome] ?? 1)))
  const d = new Date(Date.now() + 9 * 3600000)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getTomorrowDate(): string {
  const d = new Date(Date.now() + 9 * 3600000)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ── Props ────────────────────────────────────────────────────

interface Props {
  customerId:     string
  customerName:   string
  phone?:         string | null
  avgOrderCycle?: number
  compact?:       boolean
  scheduleId?:    string | null
  defaultOpen?:   boolean
  onDone?:        () => void
  onClose?:       () => void
}

// ── 컴포넌트 ─────────────────────────────────────────────────

export default function QuickActionButton({
  customerId,
  customerName,
  phone,
  avgOrderCycle = 14,
  compact       = false,
  scheduleId    = null,
  defaultOpen   = false,
  onDone,
  onClose,
}: Props) {
  const cycle = Math.max(1, avgOrderCycle ?? 7)

  const [open,           setOpen]           = useState(defaultOpen ?? false)
  const [loading,        setLoading]        = useState(false)
  const [methods,        setMethods]        = useState<string[]>(['call'])
  const [outcome,        setOutcome]        = useState<OutcomeType | ''>('')
  const [memo,           setMemo]           = useState('')
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus | ''>('')
  const [nextDate,       setNextDate]       = useState(() => calcNextActionDate('', cycle))
  const [error,          setError]          = useState('')

  // defaultOpen prop이 바뀔 때 반응
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  function reset() {
    setMethods(['call'])
    setOutcome('')
    setMemo('')
    setCustomerStatus('')
    setNextDate(calcNextActionDate('', cycle))
    setError('')
    setLoading(false)
  }

  function handleOpen()  { reset(); setOpen(true) }
  function handleClose() { reset(); setOpen(false); onClose?.() }

  function toggleMethod(m: string) {
    setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  function handleOutcomeChange(v: OutcomeType) {
    setOutcome(v)
    setNextDate(calcNextActionDate(v, cycle))
  }

  const handleSave = async () => {
    if (loading) return
    if (!methods.length)  { setError('행동을 1개 이상 선택해주세요.'); return }
    if (!outcome)          { setError('결과를 선택해주세요.'); return }
    if (!memo.trim())      { setError('메모를 입력해주세요. (필수)'); return }

    const finalNextDate = nextDate || getTomorrowDate()
    setLoading(true)
    setError('')

    if (methods.includes('call') && phone) {
      window.location.href = `tel:${phone}`
    }

    try {
      const res = await createContactLog({
        customer_id:      customerId,
        contact_method:   normalizeContactMethod(methods),
        methods,
        outcome_type:     outcome as any,
        customer_status:  customerStatus || undefined,
        next_action_date: finalNextDate,
        next_action_type: 'call',
        memo:             memo.trim(),
        schedule_id:      scheduleId,
      })

      // 성공 체크 강화 — null/undefined 방어
      if (!res || res.success !== true) {
        console.error('[QuickActionButton] save error:', res)
        setError(res?.error || '저장 실패')
        return  // 모달 유지
      }

      // onDone 먼저 (부모 refresh) → 그 다음 모달 닫기
      onDone?.()
      handleClose()

    } catch (e: any) {
      console.error('[QuickActionButton] unexpected error:', e)
      setError(e?.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────
  // Fragment로 감싸 항상 같은 위치에 마운트 유지
  // early return 구조 제거 — 버튼 위치 버그 방지

  return (
    <>
      {/* 버튼 — 모달 닫혔을 때만 표시 */}
      {!open && (
        <button
          onClick={handleOpen}
          style={{
            padding:      compact ? '4px 10px' : '7px 14px',
            background:   '#111827', color: '#fff',
            border:       'none', borderRadius: 6,
            fontSize:     compact ? 11 : 13,
            cursor:       'pointer', fontWeight: 500, whiteSpace: 'nowrap',
          }}
        >
          🎯 {compact ? '영업' : '영업 실행'}
        </button>
      )}

      {/* 모달 — open일 때만 렌더 */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            width: 460, maxWidth: '95vw', maxHeight: '90vh',
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
          }}>

            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>🎯 영업 기록</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {customerName}{phone && ` · ${phone}`}
                </div>
              </div>
              <button onClick={handleClose}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>
                ✕
              </button>
            </div>

            {/* 1. 행동 선택 */}
            <div>
              <div style={label}>1. 행동 선택 (복수 가능)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {METHODS.map(m => (
                  <button key={m.value} onClick={() => toggleMethod(m.value)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: methods.includes(m.value) ? 600 : 400, border: `2px solid ${methods.includes(m.value) ? '#111827' : '#e5e7eb'}`, background: methods.includes(m.value) ? '#111827' : '#fff', color: methods.includes(m.value) ? '#fff' : '#374151' }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 결과 선택 */}
            <div>
              <div style={label}>2. 결과 선택 <span style={{ color: '#DC2626' }}>*</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OUTCOME_TYPES.map(o => (
                  <button key={o.value} onClick={() => handleOutcomeChange(o.value)}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: outcome === o.value ? 600 : 400, background: outcome === o.value ? o.color : '#f3f4f6', color: outcome === o.value ? '#fff' : '#374151' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 메모 */}
            <div>
              <div style={label}>3. 메모 <span style={{ color: '#DC2626' }}>*</span></div>
              <textarea
                style={{ width: '100%', padding: '9px 12px', border: `1px solid ${!memo.trim() && error ? '#EF4444' : '#e5e7eb'}`, borderRadius: 8, fontSize: 13, resize: 'vertical', minHeight: 72, boxSizing: 'border-box', lineHeight: 1.5 }}
                placeholder="통화 내용, 고객 반응, 특이사항 등 (필수)"
                value={memo}
                onChange={e => setMemo(e.target.value)}
              />
            </div>

            {/* 4. 고객 상태 */}
            <div>
              <div style={label}>4. 고객 상태 (선택)</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {CUSTOMER_STATUS.map(s => (
                  <button key={s.value}
                    onClick={() => setCustomerStatus(prev => prev === s.value ? '' : s.value)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: customerStatus === s.value ? 600 : 400, border: `1px solid ${customerStatus === s.value ? '#111827' : '#e5e7eb'}`, background: customerStatus === s.value ? '#111827' : '#fff', color: customerStatus === s.value ? '#fff' : '#374151' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. 다음 행동 날짜 */}
            <div>
              <div style={label}>
                5. 다음 행동 날짜
                {outcome && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>결과 기반 자동 계산됨</span>}
              </div>
              <input type="date"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                value={nextDate}
                onChange={e => setNextDate(e.target.value)}
              />
            </div>

            {/* 에러 — 모달 유지하면서 표시 */}
            {error && (
              <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* 저장 */}
            <button onClick={handleSave} disabled={loading}
              style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, color: '#fff', background: loading ? '#93C5FD' : '#111827', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '저장 중...' : '영업 기록 저장'}
            </button>

          </div>
        </div>
      )}
    </>
  )
}

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#374151',
  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em',
}