'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { DeliveryBoardRow } from '@/actions/admin/commerce-delivery'
import DeliveryStatusPanel from '@/components/commerce/DeliveryStatusPanel'
import { DELIVERY_STATUS_LABEL, isDeliveryException } from '@/lib/delivery-tracking/status'
import s from '../../../admin-shared.module.css'

const ORDER_STATUS_LABEL: Record<string, string> = {
  paid: '결제완료',
  preparing: '준비중',
  shipped: '배송중',
  completed: '완료',
}

export default function DeliveryBoardClient({ rows }: { rows: DeliveryBoardRow[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)

  if (rows.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--ds-text-secondary)' }}>해당하는 주문이 없습니다</p>
  }

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr className={s.theadRow}>
            <th className={s.th}>주문번호</th>
            <th className={s.th}>식당명</th>
            <th className={s.th}>주문 상태</th>
            <th className={s.th}>배송 상태</th>
            <th className={s.th}>택배사 · 송장</th>
            <th className={s.th}>주문일</th>
            <th className={s.th}>입력</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <FragmentRow
              key={r.id}
              row={r}
              open={openId === r.id}
              onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
              onChanged={() => router.refresh()}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({
  row,
  open,
  onToggle,
  onChanged,
}: {
  row: DeliveryBoardRow
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  return (
    <>
      <tr>
        <td className={s.td}>
          <div className={s.cellStrong}>{row.order_number ?? row.id.slice(0, 8)}</div>
        </td>
        <td className={s.td}>{row.tenant_name ?? '—'}</td>
        <td className={s.td}>{ORDER_STATUS_LABEL[row.status] ?? row.status}</td>
        <td className={s.td} style={{ color: isDeliveryException(row.delivery_status) ? '#b91c1c' : undefined, fontWeight: 600 }}>
          {row.delivery_status ? DELIVERY_STATUS_LABEL[row.delivery_status] : '추적 시작 전'}
        </td>
        <td className={s.td}>
          {row.delivery_carrier || row.delivery_tracking_no
            ? `${row.delivery_carrier ?? '—'} · ${row.delivery_tracking_no ?? '—'}`
            : '—'}
        </td>
        <td className={s.tdNowrap}>
          {new Date(row.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })}
        </td>
        <td className={s.td}>
          <button type="button" className={open ? s.primaryBtn : s.ghostBtn} onClick={onToggle}>
            {open ? '닫기' : '상태 입력'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td className={s.td} colSpan={7}>
            <DeliveryStatusPanel mode="admin" orderId={row.id} onChanged={onChanged} />
          </td>
        </tr>
      ) : null}
    </>
  )
}
