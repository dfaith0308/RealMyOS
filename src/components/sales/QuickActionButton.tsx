'use client'

import { useState } from 'react'
import { getSalesScripts, executeMessage } from '@/actions/sales'
import { createContactLog } from '@/actions/contact'
import type { SalesScript } from '@/actions/sales'

// 변수 치환 유틸 (Server Action 아님 — 클라이언트 전용)
function applyTemplateVars(content: string, vars: {
  customer_name: string; last_order_date?: string; last_order_amount?: number
  overdue_amount?: number; main_product?: string; my_name?: string; company_name?: string
}): string {
  return content
    .replace(/\{\{customer_name\}\}/g,     vars.customer_name)
    .replace(/\{\{last_order_date\}\}/g,   vars.last_order_date    ?? '')
    .replace(/\{\{last_order_amount\}\}/g, vars.last_order_amount != null ? vars.last_order_amount.toLocaleString() + '원' : '')
    .replace(/\{\{overdue_amount\}\}/g,    vars.overdue_amount     != null ? vars.overdue_amount.toLocaleString() + '원' : '')
    .replace(/\{\{main_product\}\}/g,      vars.main_product       ?? '')
    .replace(/\{\{my_name\}\}/g,           vars.my_name            ?? '')
    .replace(/\{\{company_name\}\}/g,      vars.company_name       ?? '')
}

interface QuickActionButtonProps {
  customerId:       string
  customerName:     string
  phone?:           string | null
  overdueAmount?:   number
  lastOrderDate?:   string
  lastOrderAmount?: number
  mainProduct?:     string
  compact?:         boolean
}

const METHOD_ICON: Record<string, string> = { call: '📞', message: '💬', visit: '🚗' }
const RESULT_OPTIONS = [
  { value: 'connected',  label: '연결됨' },
  { value: 'no_answer',  label: '부재중' },
  { value: 'interested', label: '관심있음' },
  { value: 'rejected',   label: '거절' },
  { value: 'scheduled',  label: '예약됨' },
]

export default function QuickActionButton({
  customerId, customerName, phone, overdueAmount,
  lastOrderDate, lastOrderAmount, mainProduct, compact = false,
}: QuickActionButtonProps) {
  const [open,         setOpen]         = useState(false)
  const [step,         setStep]         = useState<'method' | 'script' | 'preview' | 'result'>('method')
  const [method,       setMethod]       = useState<'call' | 'message' | 'visit'>('call')
  const [scripts,      setScripts]      = useState<SalesScript[]>([])
  const [selected,     setSelected]     = useState<SalesScript | null>(null)
  const [preview,      setPreview]      = useState('')
  const [result,       setResult]       = useState('connected')
  const [nextDate,     setNextDate]     = useState('')
  const [nextType,     setNextType]     = useState<'call' | 'message' | 'visit'>('call')
  const [memo,         setMemo]         = useState('')
  const [copied,       setCopied]       = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)  // 중복 실행 방지
  const [done,         setDone]         = useState(false)

  function reset() {
    setStep('method'); setSelected(null); setPreview('')
    setResult('connected'); setNextDate(''); setMemo('')
    setCopied(false); setSaving(false); setIsSubmitting(false); setDone(false)
  }

  function handleClose() { setOpen(false); reset() }

  async function handleMethod(m: 'call' | 'message' | 'visit') {
    // 전화인데 번호 없으면 차단
    if (m === 'call' && !phone) {
      alert('전화번호가 없습니다. 거래처 정보에서 번호를 먼저 입력해주세요.')
      return
    }
    setMethod(m)
    if (m === 'call' && phone) window.location.href = `tel:${phone}`
    const res = await getSalesScripts(m)
    setScripts(res.data ?? [])
    setStep('script')
  }

  function handleSelectScript(sc: SalesScript) {
    setSelected(sc)
    // 변수 치환 — 없는 변수는 빈 문자열 기본값
    const rendered = applyTemplateVars(sc.content, {
      customer_name:      customerName,
      last_order_date:    lastOrderDate    ?? '',
      last_order_amount:  lastOrderAmount  ?? 0,
      overdue_amount:     overdueAmount    ?? 0,
      main_product:       mainProduct      ?? '',
      my_name:            '담당자',
      company_name:       '식식이유통',
    })
    setPreview(rendered)
    setStep('preview')
  }

  async function handleCopy() {
    if (isSubmitting) return  // 중복 실행 방지
    setIsSubmitting(true)
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      // message_logs 기록 (simulated)
      await executeMessage({
        customer_id:    customerId,
        script_id:      selected?.id,
        content:        preview,
        channel:        'clipboard',
        contact_method: method,
      })
      setStep('result')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSaveResult() {
    if (isSubmitting || saving) return  // 중복 실행 방지
    setSaving(true); setIsSubmitting(true)
    try {
      await createContactLog({
        customer_id:      customerId,
        contact_method:   method,
        result:           result as any,
        memo:             memo || undefined,
        next_action_date: nextDate || undefined,
        next_action_type: nextDate ? nextType : undefined,
      })
      setDone(true)
      setTimeout(handleClose, 1200)
    } finally {
      setSaving(false); setIsSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); reset() }}
        style={{
          padding: compact ? '4px 10px' : '7px 14px',
          background: '#111827', color: '#fff',
          border: 'none', borderRadius: 6,
          fontSize: compact ? 11 : 13,
          cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
        }}>
        🎯 {compact ? '영업' : '영업 실행'}
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>🎯 {customerName}</span>
          <button onClick={handleClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {done && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#16A34A', fontSize: 15, fontWeight: 600 }}>
            ✅ 이력 저장 완료
          </div>
        )}

        {/* STEP 1: 방법 선택 */}
        {step === 'method' && !done && (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>어떤 방법으로 영업하시겠습니까?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['call', 'message', 'visit'] as const).map((m) => {
                const disabled = m === 'call' && !phone
                return (
                  <button key={m} onClick={() => handleMethod(m)} disabled={disabled}
                    style={{
                      flex: 1, padding: '14px 0', background: disabled ? '#f3f4f6' : '#f9fafb',
                      border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 22,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      opacity: disabled ? 0.4 : 1,
                    }}>
                    <span>{METHOD_ICON[m]}</span>
                    <span style={{ fontSize: 12, color: '#374151' }}>
                      {m === 'call' ? '전화' : m === 'message' ? '문자' : '방문'}
                    </span>
                    {disabled && <span style={{ fontSize: 9, color: '#DC2626' }}>번호없음</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* STEP 2: 스크립트 선택 */}
        {step === 'script' && !done && (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>스크립트 선택 (건너뛰기 가능)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {scripts.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: 8 }}>등록된 스크립트 없음</div>
              )}
              {scripts.map((sc) => (
                <div key={sc.id} onClick={() => handleSelectScript(sc)}
                  style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{sc.title}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{sc.content.slice(0, 60)}...</div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep('result')}
              style={{ width: '100%', padding: '9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
              스크립트 없이 결과만 기록
            </button>
          </>
        )}

        {/* STEP 3: 미리보기 + 복사 */}
        {step === 'preview' && !done && (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>메시지 미리보기 (변수 적용됨)</div>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 14, minHeight: 80 }}>
              {preview}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('script')}
                style={{ flex: 1, padding: '9px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                ← 다시
              </button>
              <button onClick={handleCopy} disabled={isSubmitting}
                style={{
                  flex: 2, padding: '9px', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 500, color: '#fff',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  background: copied ? '#16A34A' : isSubmitting ? '#93C5FD' : '#111827',
                }}>
                {copied ? '✓ 복사됨' : isSubmitting ? '처리 중...' : '📋 클립보드 복사'}
              </button>
            </div>
          </>
        )}

        {/* STEP 4: 결과 기록 */}
        {step === 'result' && !done && (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>결과를 기록하세요</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              {RESULT_OPTIONS.map((r) => (
                <button key={r.value} onClick={() => setResult(r.value)}
                  style={{
                    padding: '6px 12px', border: 'none', borderRadius: 20,
                    fontSize: 12, cursor: 'pointer',
                    background: result === r.value ? '#111827' : '#f3f4f6',
                    color:      result === r.value ? '#fff' : '#374151',
                    fontWeight: result === r.value ? 600 : 400,
                  }}>
                  {r.label}
                </button>
              ))}
            </div>

            <textarea
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, minHeight: 56, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
              placeholder="메모 (선택)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input type="date"
                style={{ flex: 1, padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)} />
              <select
                style={{ padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                value={nextType}
                onChange={(e) => setNextType(e.target.value as any)}>
                <option value="call">전화</option>
                <option value="message">문자</option>
                <option value="visit">방문</option>
              </select>
            </div>

            <button onClick={handleSaveResult} disabled={saving || isSubmitting}
              style={{
                width: '100%', padding: '11px', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, color: '#fff',
                cursor: saving || isSubmitting ? 'not-allowed' : 'pointer',
                background: saving || isSubmitting ? '#93C5FD' : '#111827',
              }}>
              {saving ? '저장 중...' : '이력 저장'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
