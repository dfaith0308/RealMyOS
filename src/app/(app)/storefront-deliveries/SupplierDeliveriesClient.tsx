'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { SupplierDeliveryOrderRow } from '@/actions/storefront-delivery'
import DeliveryStatusPanel from '@/components/commerce/DeliveryStatusPanel'
import { DELIVERY_STATUS_LABEL, isDeliveryException } from '@/lib/delivery-tracking/status'

const LINE = '#e5e7eb'
const MUTED = '#6b7280'

export default function SupplierDeliveriesClient({ orders }: { orders: SupplierDeliveryOrderRow[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [onlyOpen, setOnlyOpen] = useState(true)

  const visible = onlyOpen ? orders.filter((o) => o.delivery_status !== 'delivered') : orders

  if (orders.length === 0) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 24, fontSize: 14, color: MUTED }}>
        아직 배정된 스토어 주문이 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: 12, color: MUTED, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
        배송 완료 주문 숨기기
      </label>

      {visible.map((o) => {
        const open = openId === o.id
        return (
          <section key={o.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {o.order_number ?? o.id.slice(0, 8)} · {o.restaurant_name ?? '식당'}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                  {new Date(o.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })}
                  {' · '}
                  {o.my_items.map((it) => `${it.title} ×${it.quantity}`).join(', ') || '품목 정보 없음'}
                </div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                  {o.shipping_name} · {o.shipping_phone} · {o.shipping_address}
                  {o.delivery_memo ? ` · 메모: ${o.delivery_memo}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: isDeliveryException(o.delivery_status) ? '#b91c1c' : o.delivery_status ? '#1f5d3a' : MUTED,
                  }}
                >
                  {o.delivery_status ? DELIVERY_STATUS_LABEL[o.delivery_status] : '추적 시작 전'}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : o.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: `1px solid ${LINE}`,
                    background: open ? '#1f5d3a' : '#fff',
                    color: open ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {open ? '닫기' : o.sole_supplier ? '배송 상태 입력' : '배송 상태 보기'}
                </button>
              </div>
            </div>
            {open ? (
              <div style={{ marginTop: 12 }}>
                <DeliveryStatusPanel
                  mode="supplier"
                  orderId={o.id}
                  canWrite={o.sole_supplier}
                  readOnlyReason="여러 공급자가 함께 보내는 주문이라 관리자가 배송 상태를 입력합니다."
                  onChanged={() => router.refresh()}
                />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
