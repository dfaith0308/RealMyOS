'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ProductRepurchaseRow } from '@/actions/product-analytics'
import SmsModal from '@/components/sms/SmsModal'

function repurchaseColor(days: number, hasCycle: boolean, daysSinceLast: number): string {
  // 실제 미구매 60일 초과면 평소 주기와 무관하게 위험(빨강)
  if (daysSinceLast > 60) return '#dc2626'
  if (hasCycle) {
    if (days <= 30) return '#1f5d3a'
    if (days <= 60) return '#d97706'
    return '#dc2626'
  }
  if (days <= 30) return '#1f5d3a'
  if (days <= 60) return '#d97706'
  return '#dc2626'
}

const ellipsis: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

export default function ProductRepurchaseListClient({
  rows,
}: {
  rows: ProductRepurchaseRow[]
}) {
  const router = useRouter()
  const [smsTarget, setSmsTarget] = useState<{
    id: string
    name: string
    phone: string
  } | null>(null)

  if (rows.length === 0) {
    return <div style={empty}>재구매 이력이 없습니다</div>
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row) => {
          const hasCycle = row.avg_cycle_days != null
          const label = hasCycle
            ? `${row.avg_cycle_days}일마다`
            : `${row.days_since_last}일 전 마지막`
          const color = repurchaseColor(
            hasCycle ? row.avg_cycle_days! : row.days_since_last,
            hasCycle,
            row.days_since_last,
          )
          // 빨강(이탈)과 동일: days_since_last > 60 → 문자 버튼 (phone 있을 때만)
          const showSmsBtn = row.days_since_last > 60 && !!row.phone

          return (
            <div
              key={row.customer_id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minWidth: 0 }}
            >
              <Link
                href={`/customers/${row.customer_id}`}
                style={{ fontSize: 14, fontWeight: 600, color: '#374151', textDecoration: 'none', ...ellipsis, minWidth: 0 }}
              >
                {row.name}
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{label}</span>
                {showSmsBtn ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSmsTarget({
                        id: row.customer_id,
                        name: row.name,
                        phone: row.phone!,
                      })
                    }
                    style={smsBtn}
                  >
                    문자
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {smsTarget ? (
        <SmsModal
          customers={[{ id: smsTarget.id, name: smsTarget.name, phone: smsTarget.phone }]}
          onClose={() => setSmsTarget(null)}
          onDone={() => {
            setSmsTarget(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}

const empty: CSSProperties = {
  fontSize: 13,
  color: '#9ca3af',
  paddingTop: 8,
}

const smsBtn: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  fontSize: 12,
  fontWeight: 700,
  color: '#374151',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
