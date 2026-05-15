import { notFound } from 'next/navigation'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { getNotifications, getUnreadNotificationCount } from '@/actions/notifications'
import { getMyBids, getSupplierRfqs } from '@/actions/rfq'
import RfqHubClient from '@/components/rfq/RfqHubClient'

export const metadata = { title: '발주요청 — RealMyOS' }

export default async function RfqPage() {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) notFound()

  const [rfqRes, bidsRes, unreadRes, notifRes] = await Promise.all([
    getSupplierRfqs(),
    getMyBids(),
    getUnreadNotificationCount(),
    getNotifications(),
  ])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>발주요청 (RFQ)</h1>
          {(unreadRes.count > 0) && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: '#dc2626',
                padding: '2px 8px',
                borderRadius: 999,
              }}
              title="미읽음 알림">
              알림 {unreadRes.count}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
          오픈된 발주요청과 내가 제출한 입찰을 확인합니다.
        </p>
      </div>

      <RfqHubClient
        supplierRfqs={rfqRes.data ?? []}
        myBids={bidsRes.data ?? []}
        rfqError={rfqRes.error}
        bidsError={bidsRes.error}
        notifications={notifRes.data ?? []}
        notificationsError={notifRes.error}
      />
    </main>
  )
}
