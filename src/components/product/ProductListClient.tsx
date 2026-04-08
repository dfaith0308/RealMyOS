'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getProductUsers } from '@/actions/product'
import { calcMarginRate, formatKRW } from '@/lib/calc'
import type { ProductListItem, ProductUser } from '@/actions/product'

interface Props {
  products: ProductListItem[]
  marginThreshold: number
}

export default function ProductListClient({ products, marginThreshold }: Props) {
  const [modalProduct, setModalProduct] = useState<ProductListItem | null>(null)
  const [users, setUsers] = useState<ProductUser[]>([])
  const [isPending, startTransition] = useTransition()

  function openUsersModal(p: ProductListItem) {
    setModalProduct(p)
    startTransition(async () => {
      const r = await getProductUsers(p.id)
      setUsers(r.data ?? [])
    })
  }

  if (products.length === 0) return (
    <p style={{ color: '#9ca3af', fontSize: 14 }}>등록된 상품이 없습니다.</p>
  )

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            {['카테고리', '코드', '상품명', '매입가', '판매가', '마진율', '사용처', '평균단가', ''].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const margin = p.selling_price && p.cost_price
              ? calcMarginRate(p.selling_price, p.cost_price) : null
            const threshold = p.min_margin_rate ?? marginThreshold
            const avgMargin = p.avg_unit_price && p.cost_price
              ? calcMarginRate(p.avg_unit_price, p.cost_price) : null
            const isWarning = avgMargin !== null && avgMargin < threshold

            return (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: isWarning ? '#FFF9F9' : '#fff' }}>
                <td style={{ ...td, color: '#9ca3af', fontSize: 11 }}>{p.category_name ?? '-'}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{p.product_code}</td>
                <td style={{ ...td, fontWeight: 500 }}>
                  {p.name}
                  {p.tax_type === 'exempt' && <span style={s.exemptBadge}>면세</span>}
                </td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{formatKRW(p.cost_price)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.selling_price ? formatKRW(p.selling_price) : '-'}</td>
                <td style={{ ...td, color: margin !== null && margin < threshold ? '#B91C1C' : '#374151', fontWeight: margin !== null && margin < threshold ? 600 : 400 }}>
                  {margin !== null ? `${margin.toFixed(1)}%` : '-'}
                </td>
                <td style={td}>
                  {p.used_by_count > 0 ? (
                    <button type="button" style={s.countBtn} onClick={() => openUsersModal(p)}>
                      {p.used_by_count}곳
                    </button>
                  ) : <span style={{ color: '#d1d5db' }}>-</span>}
                </td>
                <td style={{
                  ...td, fontVariantNumeric: 'tabular-nums',
                  color: isWarning ? '#B91C1C' : '#374151',
                  fontWeight: isWarning ? 600 : 400,
                }}>
                  {p.avg_unit_price ? (
                    <span title={`마진 ${avgMargin?.toFixed(1)}% — 기준 ${threshold}%`}>
                      {formatKRW(p.avg_unit_price)}
                      {isWarning && ' ⚠️'}
                    </span>
                  ) : '-'}
                </td>
                <td style={td}>
                  <Link href={`/products/${p.id}/edit`} style={s.editBtn}>수정</Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 사용처 모달 */}
      {modalProduct && (
        <div style={s.overlay} onClick={() => setModalProduct(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{modalProduct.name} — 사용처</span>
              <button type="button" style={s.closeBtn} onClick={() => setModalProduct(null)}>✕</button>
            </div>
            {isPending && <p style={{ color: '#9ca3af', fontSize: 13, padding: '16px' }}>불러오는 중...</p>}
            {!isPending && users.length === 0 && (
              <p style={{ color: '#9ca3af', fontSize: 13, padding: '16px' }}>사용처가 없습니다.</p>
            )}
            {!isPending && users.length > 0 && (
              <div style={s.modalBody}>
                {users.map((u) => (
                  <div key={u.customer_id} style={s.userRow}>
                    <span style={s.userName}>{u.customer_name}</span>
                    <span style={s.userPrice}>
                      {u.last_unit_price ? formatKRW(u.last_unit_price) : '-'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }
const s: Record<string, React.CSSProperties> = {
  exemptBadge: { display: 'inline-block', marginLeft: 6, padding: '1px 6px', background: '#F0FDF4', color: '#15803D', borderRadius: 4, fontSize: 10, fontWeight: 600 },
  countBtn:    { padding: '3px 8px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, color: '#1D4ED8', cursor: 'pointer' },
  editBtn:     { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151', textDecoration: 'none' },
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:       { background: '#fff', borderRadius: 12, width: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' },
  modalTitle:  { fontSize: 14, fontWeight: 600, color: '#111827' },
  closeBtn:    { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#6b7280' },
  modalBody:   { overflowY: 'auto', padding: '8px 0' },
  userRow:     { display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #f3f4f6' },
  userName:    { fontSize: 13, color: '#374151' },
  userPrice:   { fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
}
