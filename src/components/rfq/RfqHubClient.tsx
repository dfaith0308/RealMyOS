'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formatKRW } from '@/lib/calc'
import type { MyBidRow, SupplierRfqRow } from '@/actions/rfq'
import type { NotificationRow } from '@/actions/notifications'
import { markNotificationRead } from '@/actions/notifications'

type Props = {
  supplierRfqs: SupplierRfqRow[]
  myBids: MyBidRow[]
  rfqError: string | null
  bidsError: string | null
  notifications: NotificationRow[]
  notificationsError: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function ExposeBadge({ level }: { level: number | null }) {
  if (level == null) return null
  const map = {
    1: { label: '기존 거래처', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    2: { label: '지역 확장', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    3: { label: '전체 공개', bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' },
  } as const
  const s = map[level as 1 | 2 | 3]
  if (!s) return null
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}>
      {s.label}
    </span>
  )
}

export default function RfqHubClient({
  supplierRfqs,
  myBids,
  rfqError,
  bidsError,
  notifications,
  notificationsError,
}: Props) {
  const router = useRouter()
  const [pendingRead, startTransition] = useTransition()
  const [tab, setTab] = useState<'open' | 'bids'>('open')

  const tabBtn = (active: boolean) => ({
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    background: active ? 'var(--color-primary)' : '#f3f4f6',
    color: active ? '#fff' : '#374151',
  } as const)

  const th = { textAlign: 'left' as const, padding: '10px 12px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }
  const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button type="button" style={tabBtn(tab === 'open')} onClick={() => setTab('open')}>
          발주요청
        </button>
        <button type="button" style={tabBtn(tab === 'bids')} onClick={() => setTab('bids')}>
          내 입찰
        </button>
      </div>

      <div style={{ marginBottom: 24, padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>알림</h2>
        {notificationsError && (
          <p style={{ color: '#b91c1c', fontSize: 13 }}>{notificationsError}</p>
        )}
        {!notificationsError && notifications.length === 0 && (
          <p style={{ fontSize: 13, color: '#6b7280' }}>알림이 없습니다.</p>
        )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {notifications.map((n) => (
              <li
                key={n.id}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid #f3f4f6',
                  opacity: n.is_read ? 0.65 : 1,
                }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{n.message}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  {!n.is_read && (
                    <button
                      type="button"
                      disabled={pendingRead}
                      onClick={() => {
                        startTransition(async () => {
                          await markNotificationRead(n.id)
                          router.refresh()
                        })
                      }}
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        background: '#fff',
                        cursor: pendingRead ? 'wait' : 'pointer',
                      }}>
                      읽음
                    </button>
                  )}
                  {n.action_link && (
                    <button
                      type="button"
                      onClick={() => router.push(n.action_link!)}
                      style={{
                        fontSize: 11,
                        padding: '4px 10px',
                        border: 'none',
                        borderRadius: 6,
                        background: 'var(--color-primary-light, #e0e7ff)',
                        color: 'var(--color-primary, #3730a3)',
                        cursor: 'pointer',
                      }}>
                      이동
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
      </div>

      {tab === 'open' && (
        <>
          {rfqError && (
            <p style={{ color: '#b91c1c', fontSize: 13 }}>발주요청 조회 오류: {rfqError}</p>
          )}
          {!rfqError && supplierRfqs.length === 0 && (
            <p style={{ color: '#6b7280', fontSize: 14 }}>표시할 오픈 발주요청이 없습니다.</p>
          )}
          {!rfqError && supplierRfqs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>품목</th>
                    <th style={th}>노출</th>
                    <th style={th}>수량</th>
                    <th style={th}>목표가</th>
                    <th style={th}>마감</th>
                    <th style={th}>지역</th>
                    <th style={th}>상태</th>
                    <th style={th}>등록</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierRfqs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/rfq/${r.id}`)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
                      <td style={td}>{r.product_name}</td>
                      <td style={td}><ExposeBadge level={r.expose_level ?? null} /></td>
                      <td style={td}>{r.quantity}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td style={td}>{r.target_price != null ? formatKRW(r.target_price) : '—'}</td>
                      <td style={td}>{fmtDate(r.deadline)}</td>
                      <td style={td}>{r.region ?? '—'}</td>
                      <td style={td}>{r.status}</td>
                      <td style={td}>{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'bids' && (
        <>
          {bidsError && (
            <p style={{ color: '#b91c1c', fontSize: 13 }}>내 입찰 조회 오류: {bidsError}</p>
          )}
          {!bidsError && myBids.length === 0 && (
            <p style={{ color: '#6b7280', fontSize: 14 }}>제출한 입찰이 없습니다.</p>
          )}
          {!bidsError && myBids.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>품목</th>
                    <th style={th}>수량</th>
                    <th style={th}>제안가</th>
                    <th style={th}>납기(일)</th>
                    <th style={th}>마감</th>
                    <th style={th}>입찰 상태</th>
                    <th style={th}>RFQ 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {myBids.map((b) => {
                    const rq = b.rfq_requests
                    return (
                      <tr key={b.id}>
                        <td style={td}>{rq?.product_name ?? `RFQ ${b.rfq_id.slice(0, 8)}…`}</td>
                        <td style={td}>
                          {rq ? `${rq.quantity}${rq.unit ? ` ${rq.unit}` : ''}` : '—'}
                        </td>
                        <td style={td}>{formatKRW(b.price)}</td>
                        <td style={td}>{b.delivery_days ?? '—'}</td>
                        <td style={td}>{fmtDate(rq?.deadline ?? null)}</td>
                        <td style={td}>{b.status}</td>
                        <td style={td}>{rq?.status ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
