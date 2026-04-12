'use client'

// ============================================================
// RealMyOS - 전화 버튼
// src/components/customer/CallButton.tsx
// ============================================================

import { useTransition } from 'react'
import { createContactLog } from '@/actions/contact'
import { logAction } from '@/actions/action-log'
import type { CustomerStatus } from '@/actions/ledger'

interface CallButtonProps {
  customerId: string
  phone: string
  style: 'red' | 'hot' | 'cold'
  triggeredMessage?: string
  messageKey?: string
  customerStatus?: CustomerStatus
  scoreAtTime?: number
  amountAtTime?: number
}

const STYLES: Record<string, React.CSSProperties> = {
  red:  { padding: '6px 12px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 12, color: '#B91C1C', fontWeight: 600, cursor: 'pointer' },
  hot:  { padding: '7px 13px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 12, color: '#B91C1C', fontWeight: 700, cursor: 'pointer' },
  cold: { padding: '7px 13px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', cursor: 'pointer' },
}

export default function CallButton({
  customerId, phone, style,
  triggeredMessage, messageKey, customerStatus, scoreAtTime, amountAtTime,
}: CallButtonProps) {
  const [, startTransition] = useTransition()

  async function handleCall() {
    // 1. action_log 기록 (conversion_status = 'unknown' 초기값)
    const actionLogId = await logAction({
      customer_id:       customerId,
      action_type:       'call',
      triggered_message: triggeredMessage,
      message_key:       messageKey,
      customer_status:   customerStatus,
      score_at_time:     scoreAtTime,
      amount_at_time:    amountAtTime,
    })

    // 2. 전화 즉시 실행
    window.location.href = `tel:${phone}`

    // 3. contact_log = call + conversion = attempt (백그라운드)
    startTransition(() =>
      createContactLog({
        customer_id:       customerId,
        contact_method:    'call',
        action_log_id:     actionLogId ?? undefined,
        conversion_status: 'attempt',
      })
    )
  }

  return (
    <button style={STYLES[style]} onClick={handleCall}>
      📞 전화
    </button>
  )
}
