'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import QuickActionButton from '@/components/sales/QuickActionButton'
import type { TodaySalesSummary, TodaySalesItem } from '@/actions/sales'

const METHOD_ICON: Record<string, string> = {
  call: '📞', message: '💬', visit: '🚗', kakao: '🟡',
}

export default function TodaySalesWidget({ data }: { data: TodaySalesSummary }) {
  const router = useRouter()
  const [activeItem, setActiveItem] = useState<TodaySalesItem | null>(null)

  if (data.total === 0) return null

  return (
    <div style={{
      border: '1px solid #BFDBFE',
      borderRadius: 12,
      background: '#F0F9FF',
      padding: '16px 20px',
      marginBottom: 16,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1D4ED8' }}>🎯 오늘 해야 할 영업</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            완료 {data.done} / 미완료 {data.pending}
          </span>
        </div>
        <a href="/sales/schedule" style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none' }}>
          전체 보기 →
        </a>
      </div>

      {/* 진행 바 */}
      {data.total > 0 && (
        <div style={{ height: 4, background: '#BFDBFE', borderRadius: 4, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.round((data.done / data.total) * 100)}%`,
            background: '#2563EB',
            borderRadius: 4,
            transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* 항목 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {data.items.filter(i => i.status !== 'done').slice(0, 5).map((item, idx) => (
          <div key={`${item.customer_id}-${idx}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#fff', borderRadius: 8, padding: '9px 12px',
              border: '1px solid #DBEAFE',
            }}>
            {/* 왼쪽 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{METHOD_ICON[item.action_type] ?? '📞'}</span>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{item.customer_name}</span>
                {item.phone && (
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{item.phone}</span>
                )}
              </div>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10,
                background: item.source === '스케줄' ? '#EFF6FF' : '#F5F3FF',
                color:      item.source === '스케줄' ? '#1D4ED8' : '#7C3AED',
              }}>
                {item.source}
              </span>
            </div>

            {/* 오른쪽 — 영업 실행 버튼 */}
            <QuickActionButton
              customerId={item.customer_id}
              customerName={item.customer_name}
              phone={item.phone}
              scheduleId={item.schedule_id ?? null}
              onDone={() => router.refresh()}
              compact
            />
          </div>
        ))}
      </div>

      {/* 완료 항목 수 표시 */}
      {data.done > 0 && (
        <div style={{ fontSize: 12, color: '#16A34A', marginTop: 10, textAlign: 'right' }}>
          ✓ 오늘 {data.done}건 완료
        </div>
      )}
    </div>
  )
}
