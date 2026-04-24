'use client'

// ============================================================
// RealMyOS - 통화 결과 버튼
// src/components/customer/CallOutcomeButtons.tsx
//
// call_attempt 로그 옆에 표시
// 클릭 시 contact_logs에 outcome 저장
// ============================================================

import { useState, useTransition } from 'react'
import { createContactLog } from '@/actions/contact'
import type { ContactResult } from '@/actions/contact'

function normalizeDbOutcome(raw: string | null | undefined): ContactResult | null {
  if (!raw) return null
  if (raw === 'callback_needed') return 'scheduled'
  const allowed: ContactResult[] = ['connected', 'no_answer', 'interested', 'rejected', 'scheduled']
  return (allowed as string[]).includes(raw) ? (raw as ContactResult) : null
}

const OUTCOMES: { value: ContactResult; label: string; color: string; bg: string }[] = [
  { value: 'connected', label: '통화됨',   color: '#15803D', bg: '#F0FDF4' },
  { value: 'no_answer', label: '부재중',   color: '#B45309', bg: '#FFFBEB' },
  { value: 'rejected',  label: '거절',     color: '#B91C1C', bg: '#FEF2F2' },
  { value: 'scheduled', label: '다시연락', color: '#6b7280', bg: '#F3F4F6' },
]

const OUTCOME_LABEL: Partial<Record<ContactResult, string>> = {
  connected: '통화됨',
  no_answer: '부재중',
  rejected:  '거절',
  scheduled: '다시연락',
}

interface Props {
  customerId: string
  actionLogId: string
  /** DB contact_logs.outcome 원문 (레거시 값 포함) */
  existingOutcome: string | null
}

export default function CallOutcomeButtons({
  customerId,
  actionLogId,
  existingOutcome,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<ContactResult | null>(() => normalizeDbOutcome(existingOutcome))

  // 이미 결과 기록된 경우 뱃지만 표시
  if (saved) {
    const opt = OUTCOMES.find((o) => o.value === saved)!
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>통화 결과:</span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 10,
          color: opt.color, background: opt.bg,
        }}>
          {OUTCOME_LABEL[saved] ?? saved}
        </span>
      </div>
    )
  }

  function handleOutcome(outcome: ContactResult) {
    startTransition(() => {
      void (async () => {
        const result = await createContactLog({
          customer_id:    customerId,
          contact_method: 'call',
          action_log_id:  actionLogId,
          result:           outcome,
        })
        if (result.success) setSaved(outcome)
      })()
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#9ca3af' }}>통화 결과:</span>
      {OUTCOMES.map((opt) => (
        <button
          key={opt.value}
          style={{
            padding: '2px 8px',
            fontSize: 11, fontWeight: 500,
            border: `1px solid ${opt.color}20`,
            borderRadius: 10,
            color: opt.color,
            background: opt.bg,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
          onClick={() => handleOutcome(opt.value)}
          disabled={isPending}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
