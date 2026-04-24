'use client'

// ============================================================
// RealMyOS - 수금 / 주문 버튼 (클릭 추적 포함)
// src/components/customer/ActionButton.tsx
// ============================================================

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logAction } from '@/actions/action-log'
import type { ActionType } from '@/actions/action-log'
import type { CustomerStatus } from '@/actions/ledger'

interface ActionButtonProps {
  customerId: string
  actionType: ActionType
  href: string
  label: string
  btnStyle: React.CSSProperties
  triggeredMessage?: string
  messageKey?: string
  customerStatus?: CustomerStatus
  scoreAtTime?: number
  amountAtTime?: number
}

export default function ActionButton({
  customerId, actionType, href, label, btnStyle,
  triggeredMessage, messageKey, customerStatus, scoreAtTime, amountAtTime,
}: ActionButtonProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      void logAction({
        customer_id:       customerId,
        action_type:       actionType,
        triggered_message: triggeredMessage,
        message_key:       messageKey,
        customer_status:   customerStatus,
        score_at_time:     scoreAtTime,
        amount_at_time:    amountAtTime,
      })
    })
    router.push(href)
  }

  return (
    <button style={{ ...btnStyle, cursor: 'pointer', border: 'none' }} onClick={handleClick}>
      {label}
    </button>
  )
}
