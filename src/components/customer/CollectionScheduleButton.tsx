'use client'

import { useState } from 'react'
import CollectionScheduleModal from './CollectionScheduleModal'
import type { CollectionSchedule } from '@/actions/collection'

interface Props {
  customerId:   string
  customerName: string
  existing?:    CollectionSchedule | null
  compact?:     boolean
}

const METHOD_KO = { card: '카드', cash: '현금', transfer: '계좌이체' } as const

export default function CollectionScheduleButton({
  customerId, customerName, existing, compact,
}: Props) {
  const [open, setOpen] = useState(false)

  const todayKST = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

  // ── 표시 계산 ──────────────────────────────────────────────
  let icon   = '🗓'
  let label  = '수금 예정'
  let bg     = '#fff'
  let border = '#e5e7eb'
  let color  = '#374151'
  let fw: number = 400

  if (existing) {
    const d    = existing.scheduled_date
    const diff = Math.round(
      (new Date(d + 'T00:00:00Z').getTime() - new Date(todayKST + 'T00:00:00Z').getTime())
      / 86400000
    )
    const method = METHOD_KO[existing.method as keyof typeof METHOD_KO] ?? existing.method
    fw = 600

    if (diff < 0) {
      icon   = '⚠️'
      label  = `${d} ${method} (+${Math.abs(diff)}일 초과)`
      bg     = '#FEF2F2'; border = '#FCA5A5'; color = '#B91C1C'
    } else if (diff === 0) {
      icon   = '🔔'
      label  = `TODAY ${method}`
      bg     = '#FFF7ED'; border = '#FED7AA'; color = '#C2410C'
    } else if (diff <= 3) {
      icon   = '📅'
      label  = `D-${diff} ${d} ${method}`
      bg     = '#F5F3FF'; border = '#C4B5FD'; color = '#7C3AED'
    } else {
      icon   = '📅'
      label  = `${d} ${method}`
      bg     = '#F5F3FF'; border = '#C4B5FD'; color = '#7C3AED'
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={existing ? `${existing.scheduled_date} ${METHOD_KO[existing.method as keyof typeof METHOD_KO]} ${existing.note ?? ''}` : '수금 예정 등록'}
        style={{
          padding:      compact ? '4px 8px' : '7px 13px',
          background:   bg,
          border:       `1px solid ${border}`,
          borderRadius: 6,
          fontSize:     12,
          cursor:       'pointer',
          color,
          fontWeight:   fw,
          whiteSpace:   'nowrap',
        }}
      >
        {compact ? `${icon} ${label}` : `${icon} ${label}`}
      </button>

      {open && (
        <CollectionScheduleModal
          customerId={customerId}
          customerName={customerName}
          existing={existing}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}