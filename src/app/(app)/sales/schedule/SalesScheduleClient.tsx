'use client'

import { useState } from 'react'
import { snoozeSchedule, updateScheduleStatus, createSalesSchedule, deleteSchedule, updateSchedule, getScheduleById } from '@/actions/sales'
import QuickActionButton from '@/components/sales/QuickActionButton'
import { createContactLog } from '@/actions/contact'
import type { SalesTarget, SalesScript, SalesSchedule } from '@/actions/sales'
import type { ContactResult, NextActionType } from '@/actions/contact'

// ============================================================
// 유틸
// ============================================================

const METHOD_LABEL: Record<string, string> = { call: '📞 전화', message: '💬 문자', visit: '🚗 방문' }
const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  connected:  { label: '연결됨',   color: '#16A34A' },
  no_answer:  { label: '부재중',   color: '#6b7280' },
  interested: { label: '관심있음', color: '#2563EB' },
  rejected:   { label: '거절',     color: '#DC2626' },
  scheduled:  { label: '예약됨',   color: '#D97706' },
}

function todayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}

function formatKRW(n: number) { return n > 0 ? n.toLocaleString() + '원' : '-' }

// ============================================================
// 스케줄 수정 모달
// ============================================================

function ScheduleEditModal({ schedule, onSave, onClose }: {
  schedule: { id: string; customer_name: string; scheduled_date: string; action_type: string }
  onSave:   (data: { scheduled_date?: string; action_type?: string }) => void
  onClose:  () => void
}) {
  const [date,   setDate]   = useState(schedule.scheduled_date)
  const [action, setAction] = useState(schedule.action_type)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    onSave({ scheduled_date: date, action_type: action })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>스케줄 수정 — {schedule.customer_name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>날짜</div>
          <input type="date" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}
            value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>방법</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['call','message','visit'] as const).map((v) => {
              const label = v === 'call' ? '📞 전화' : v === 'message' ? '💬 문자' : '🚗 방문'
              return (
                <button key={v} onClick={() => setAction(v)}
                  style={{ flex: 1, padding: '8px 0', border: `2px solid ${action === v ? '#111827' : '#e5e7eb'}`, borderRadius: 7, fontSize: 13, cursor: 'pointer', background: action === v ? '#111827' : '#fff', color: action === v ? '#fff' : '#374151', fontWeight: action === v ? 600 : 400 }}>
                  {label}
                </button>
              )
            })}
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


// ============================================================
// 인라인 캘린더
// ============================================================

function MiniCalendar({ selected, onSelect, markedDates }: {
  selected: string
  onSelect: (d: string) => void
  markedDates: Set<string>
}) {
  const initial = new Date(selected + 'T00:00:00')
  const [year,  setYear]  = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  const today = todayKST()

  function prev() { month === 0 ? (setYear(y => y-1), setMonth(11)) : setMonth(m => m-1) }
  function next() { month === 11 ? (setYear(y => y+1), setMonth(0)) : setMonth(m => m+1) }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const MON = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const DAY = ['일','월','화','수','목','금','토']

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={prev} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{year}년 {MON[month]}</span>
        <button onClick={next} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f3f4f6' }}>
        {DAY.map((d, i) => (
          <div key={d} style={{ padding: '5px 0', textAlign: 'center', fontSize: 11, color: i===0 ? '#EF4444' : i===6 ? '#3B82F6' : '#9ca3af', fontWeight: 500 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e${idx}`} style={{ padding: '6px 2px' }} />
          const ds  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isSel   = ds === selected
          const isToday = ds === today
          const hasMark = markedDates.has(ds)
          const col     = idx % 7
          return (
            <div key={ds} onClick={() => onSelect(ds)}
              style={{ padding: '5px 2px', textAlign: 'center', cursor: 'pointer', background: isSel ? '#111827' : isToday ? '#EFF6FF' : 'transparent', borderRadius: isSel ? 6 : 0 }}>
              <span style={{ fontSize: 13, fontWeight: isSel || isToday ? 700 : 400, color: isSel ? '#fff' : isToday ? '#2563EB' : col===0 ? '#EF4444' : col===6 ? '#3B82F6' : '#374151' }}>
                {day}
              </span>
              {hasMark && !isSel && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B', margin: '0 auto' }} />}
            </div>
          )
        })}
      </div>
    </div>

  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function SalesScheduleClient({ initialTargets, initialScripts, initialSchedules }: {
  initialTargets:   SalesTarget[]
  initialScripts:   SalesScript[]
  initialSchedules: SalesSchedule[]
}) {
  const [schedules,    setSchedules]    = useState(initialSchedules)
  const [selectedDate, setSelectedDate] = useState(todayKST())
  const [snoozingId,   setSnoozingId]   = useState<string | null>(null)
  const [doneIds,      setDoneIds]      = useState<Set<string>>(new Set())
  const [actionSchedule, setActionSchedule] = useState<{id: string; customerId: string; customerName: string; phone?: string|null} | null>(null)
  const [showAdd,      setShowAdd]      = useState(false)
  const [newCustName,  setNewCustName]  = useState('')
  const [newAction,    setNewAction]    = useState<'call'|'message'|'visit'>('call')
  const [adding,       setAdding]       = useState(false)
  const [editTarget,   setEditTarget]   = useState<typeof schedules[0] | null>(null)

  // 행동 기록 패널
  const [activeTarget, setActive]    = useState<SalesTarget | null>(null)
  const [activeMethod, setMethod]    = useState<'call'|'message'|'visit'>('call')
  const [result,       setResult]    = useState<ContactResult>('connected')
  const [memo,         setMemo]      = useState('')
  const [nextDate,     setNextDate]  = useState('')
  const [nextType,     setNextType]  = useState<NextActionType>('call')
  const [saving,       setSaving]    = useState(false)

  // 캘린더 마킹
  const markedDates = new Set(
    schedules.filter(s => s.status !== 'done' && s.status !== 'cancelled').map(s => s.scheduled_date)
  )

  // 선택 날짜 스케줄
  const daySchedules = schedules.filter(s => s.scheduled_date === selectedDate && s.status !== 'cancelled')

  async function handleSnooze(sch: SalesSchedule) {
    if (snoozingId) return
    setSnoozingId(sch.id)
    const res = await snoozeSchedule(sch.id)
    if (res.success && res.data) {
      setSchedules(prev => prev.map(s => s.id === sch.id
        ? { ...s, scheduled_date: res.data!.new_date, snooze_count: (s.snooze_count ?? 0) + 1, original_date: s.original_date ?? s.scheduled_date }
        : s))
    }
    setSnoozingId(null)
  }

  // 영업 실행 버튼 → 최신 스케줄 재조회 후 모달 열기
  async function handleActionSchedule(sch: { id: string; customer_id: string; customer_name: string; phone?: string | null }) {
    // 최신 데이터 확인 — 이미 완료됐거나 취소된 경우 차단
    const latest = await getScheduleById(sch.id)
    if (latest.success && latest.data?.status === 'done') {
      alert('이미 완료된 스케줄입니다.')
      return
    }
    if (latest.success && latest.data?.status === 'cancelled') {
      alert('취소된 스케줄입니다.')
      return
    }
    setActionSchedule({ id: sch.id, customerId: sch.customer_id, customerName: sch.customer_name, phone: sch.phone })
  }

  // QuickActionButton 저장 완료 후 스케줄 done 처리
  async function handleScheduleDone(scheduleId: string) {
    if (doneIds.has(scheduleId)) return
    setDoneIds(prev => new Set(prev).add(scheduleId))
    await updateScheduleStatus(scheduleId, 'done')
    setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: 'done' } : s))
    setActionSchedule(null)
  }

  async function handleDeleteSchedule(id: string) {
    if (!confirm('이 스케줄을 삭제하시겠습니까?')) return
    const res = await deleteSchedule(id)
    if (res.success) setSchedules(prev => prev.filter(s => s.id !== id))
  }

  async function handleUpdateSchedule(id: string, data: { scheduled_date?: string; action_type?: string }) {
    const res = await updateSchedule(id, data)
    if (res.success) {
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...data } as typeof s : s))
      setEditTarget(null)
    }
  }

  async function handleAdd() {
    if (!newCustName.trim() || adding) return
    setAdding(true)
    const target = initialTargets.find(t => t.customer_name.includes(newCustName.trim()))
    if (!target) { alert('거래처를 찾을 수 없습니다.'); setAdding(false); return }
    const res = await createSalesSchedule({ customer_id: target.customer_id, scheduled_date: selectedDate, action_type: newAction })
    if (res.success) {
      setSchedules(prev => [...prev, { id: res.data!.id, customer_id: target.customer_id, customer_name: target.customer_name, scheduled_date: selectedDate, action_type: newAction, script_id: null, status: 'pending', snooze_count: 0, original_date: null, memo: null }])
      setShowAdd(false); setNewCustName('')
    }
    setAdding(false)
  }

  async function handleSaveResult() {
    if (!activeTarget || saving) return
    setSaving(true)
    await createContactLog({
      customer_id: activeTarget.customer_id, contact_method: activeMethod,
      result, memo: memo || undefined,
      next_action_date: nextDate || undefined,
      next_action_type: nextDate ? nextType : undefined,
    })
    setSaving(false); setActive(null)
  }

  return (
    <>
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system, "Noto Sans KR", sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 20px' }}>영업 스케쥴</h1>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── 왼쪽: 캘린더 ── */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <MiniCalendar selected={selectedDate} onSelect={setSelectedDate} markedDates={markedDates} />
          <button onClick={() => setSelectedDate(todayKST())}
            style={{ width: '100%', marginTop: 8, padding: '7px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
            오늘로 이동
          </button>

          {/* 우선순위 TOP 5 */}
          {initialTargets.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                영업 우선순위
              </div>
              {initialTargets.slice(0, 5).map((t, idx) => (
                <div key={t.customer_id}
                  onClick={() => { setActive(t); setMethod('call'); setResult('connected'); setMemo(''); setNextDate('') }}
                  style={{ padding: '8px 10px', border: `1px solid ${activeTarget?.customer_id === t.customer_id ? '#2563EB' : '#e5e7eb'}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: activeTarget?.customer_id === t.customer_id ? '#EFF6FF' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: idx < 3 ? '#DC2626' : '#9ca3af', minWidth: 20 }}>{idx+1}위</span>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{t.customer_name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{Math.round(t.score)}</span>
                  </div>
                  {t.overdue_amount > 0 && (
                    <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>연체 {formatKRW(t.overdue_amount)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 가운데: 날짜별 스케줄 ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: selectedDate === todayKST() ? '#2563EB' : '#374151' }}>
              {selectedDate}
              {selectedDate === todayKST() && <span style={{ marginLeft: 8, fontSize: 11, background: '#EFF6FF', color: '#2563EB', padding: '2px 7px', borderRadius: 10 }}>오늘</span>}
            </div>
            <button onClick={() => setShowAdd(v => !v)}
              style={{ padding: '6px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
              + 예약 추가
            </button>
          </div>

          {showAdd && (
            <div style={{ border: '1px solid #BFDBFE', borderRadius: 10, padding: 12, marginBottom: 12, background: '#EFF6FF' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                  placeholder="거래처명" value={newCustName} onChange={e => setNewCustName(e.target.value)} />
                <select style={{ padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                  value={newAction} onChange={e => setNewAction(e.target.value as any)}>
                  <option value="call">📞</option>
                  <option value="message">💬</option>
                  <option value="visit">🚗</option>
                </select>
                <button onClick={handleAdd} disabled={adding}
                  style={{ padding: '7px 14px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                  {adding ? '...' : '추가'}
                </button>
              </div>
            </div>
          )}

          {daySchedules.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
              {selectedDate}에 예약된 스케줄이 없습니다.
            </div>
          ) : daySchedules.map(sch => {
            const isSnoozed  = (sch.snooze_count ?? 0) > 0
            const isSnoozingThis = snoozingId === sch.id
            const isDone     = sch.status === 'done' || doneIds.has(sch.id)
            return (
              <div key={sch.id} style={{ border: `1px solid ${isSnoozed ? '#FCD34D' : '#e5e7eb'}`, borderRadius: 10, padding: 14, marginBottom: 10, background: isDone ? '#f9fafb' : isSnoozed ? '#FFFBEB' : '#fff', opacity: isDone ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{sch.customer_name}</span>
                    <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>{METHOD_LABEL[sch.action_type]}</span>
                  </div>
                  {isSnoozed && (
                    <div style={{ fontSize: 11, color: '#D97706', textAlign: 'right' }}>
                      미룸 {sch.snooze_count}회
                      {sch.original_date && <div>(원래: {sch.original_date})</div>}
                    </div>
                  )}
                </div>
                {!isDone && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => handleActionSchedule(sch)}
                      style={{ padding: '5px 12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>🎯 영업 실행</button>
                    <button onClick={() => handleSnooze(sch)} disabled={isSnoozingThis}
                      style={{ padding: '5px 10px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6, fontSize: 12, cursor: isSnoozingThis ? 'not-allowed' : 'pointer', color: '#92400E' }}>
                      {isSnoozingThis ? '...' : '내일로'}
                    </button>
                    <button onClick={() => setEditTarget(sch)}
                      style={{ padding: '5px 10px', border: '1px solid #DBEAFE', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#EFF6FF', color: '#2563EB' }}>✏️ 수정</button>
                    <button onClick={() => handleDeleteSchedule(sch.id)}
                      style={{ padding: '5px 10px', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#FFF', color: '#DC2626' }}>🗑</button>
                  </div>
                )}
                {isDone && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 500 }}>✓ 완료</span>
                    <button onClick={() => handleDeleteSchedule(sch.id)}
                      style={{ padding: '3px 8px', border: '1px solid #FECACA', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: '#fff', color: '#DC2626' }}>🗑</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── 오른쪽: 행동 기록 패널 ── */}
        {activeTarget && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{activeTarget.customer_name}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                {activeTarget.phone && <span>{activeTarget.phone} · </span>}
                마지막주문 {activeTarget.days_since_last_order === 999 ? '없음' : `${activeTarget.days_since_last_order}일 전`}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['call','message','visit'] as const).map(m => (
                  <button key={m} onClick={() => { setMethod(m); if (m === 'call' && activeTarget.phone) window.location.href = `tel:${activeTarget.phone}` }}
                    style={{ flex: 1, padding: '7px 0', fontSize: 16, border: `1px solid ${activeMethod === m ? '#2563EB' : '#e5e7eb'}`, borderRadius: 7, background: activeMethod === m ? '#EFF6FF' : '#fff', cursor: 'pointer' }}>
                    {m === 'call' ? '📞' : m === 'message' ? '💬' : '🚗'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                {(Object.entries(RESULT_LABEL) as [ContactResult, {label:string;color:string}][]).map(([k,v]) => (
                  <button key={k} onClick={() => setResult(k)}
                    style={{ padding: '4px 10px', border: 'none', borderRadius: 20, fontSize: 11, cursor: 'pointer', background: result === k ? v.color : '#f3f4f6', color: result === k ? '#fff' : '#374151', fontWeight: result === k ? 600 : 400 }}>
                    {v.label}
                  </button>
                ))}
              </div>

              <textarea style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, resize: 'none', height: 52, boxSizing: 'border-box', marginBottom: 10 }}
                placeholder="메모 (선택)" value={memo} onChange={e => setMemo(e.target.value)} />

              <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                <input type="date" style={{ flex: 1, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                  value={nextDate} onChange={e => setNextDate(e.target.value)} />
                <select style={{ padding: '6px 7px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                  value={nextType} onChange={e => setNextType(e.target.value as NextActionType)}>
                  <option value="call">전화</option>
                  <option value="message">문자</option>
                  <option value="visit">방문</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setActive(null)}
                  style={{ flex: 1, padding: '8px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
                <button onClick={handleSaveResult} disabled={saving}
                  style={{ flex: 2, padding: '8px', background: saving ? '#93C5FD' : '#111827', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {saving ? '저장 중...' : '이력 저장'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* 스케줄 수정 모달 */}
    {editTarget && (
      <ScheduleEditModal
        schedule={editTarget}
        onSave={(data) => handleUpdateSchedule(editTarget.id, data)}
        onClose={() => setEditTarget(null)}
      />
    )}

    {actionSchedule && (
      <QuickActionButton
        customerId={actionSchedule.customerId}
        customerName={actionSchedule.customerName}
        phone={actionSchedule.phone ?? undefined}
        scheduleId={actionSchedule.id}
        defaultOpen={true}
        onDone={() => handleScheduleDone(actionSchedule.id)}
      />
    )}
    </>
  )
}