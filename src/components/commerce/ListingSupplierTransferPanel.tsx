'use client'

// 리스팅 판매자 이관 패널 — 되돌리기 어려운 작업이라 반드시 2단계로 실행한다.
//   1) 공급자 선택 → "이관 검토" : 서버에서 현재 소유자·주문 영향·차단 사유를 읽어 보여준다
//   2) 확인 체크 → "이관 실행"   : 리스팅 행을 제자리 UPDATE 한다 (listing_id 보존)

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getListingTransferPreview,
  getTransferableSuppliers,
  transferListingSupplier,
  type ListingTransferPreview,
} from '@/actions/admin/commerce-listing-transfer'

const PLATFORM_OWNER_TENANT = '00000000-0000-0000-0000-000000000000'

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  marginTop: 24,
  background: '#fff',
}
const label: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 4 }
const btn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: 13,
  cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  ...btn,
  background: '#b91c1c',
  borderColor: '#b91c1c',
  color: '#fff',
  fontWeight: 700,
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '6px 0',
  fontSize: 13,
  borderBottom: '1px solid #f3f4f6',
}

export default function ListingSupplierTransferPanel({ listingId }: { listingId: string }) {
  const router = useRouter()
  const [isPending, startTr] = useTransition()

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[] | null>(null)
  const [supplierId, setSupplierId] = useState('')
  const [preview, setPreview] = useState<ListingTransferPreview | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function loadSuppliers() {
    setError(null)
    startTr(async () => {
      const res = await getTransferableSuppliers()
      if (!res.success || !res.data) {
        setError(res.error ?? '공급자 목록을 불러오지 못했습니다')
        return
      }
      setSuppliers(res.data.suppliers)
    })
  }

  function handleReview() {
    setError(null)
    setPreview(null)
    setAcknowledged(false)
    if (!supplierId) {
      setError('이관할 공급자를 선택해 주세요')
      return
    }
    startTr(async () => {
      const res = await getListingTransferPreview(listingId)
      if (!res.success || !res.data) {
        setError(res.error ?? '이관 영향을 확인하지 못했습니다')
        return
      }
      setPreview(res.data)
    })
  }

  function handleTransfer() {
    setError(null)
    startTr(async () => {
      const res = await transferListingSupplier({
        listing_id: listingId,
        supplier_tenant_id: supplierId,
        reason: reason.trim() || null,
      })
      if (!res.success || !res.data) {
        setError(res.error ?? '이관에 실패했습니다')
        return
      }
      setDone(res.data.listing_id)
      setPreview(null)
      setAcknowledged(false)
      router.refresh()
    })
  }

  const targetName = suppliers?.find((s) => s.id === supplierId)?.name ?? ''
  const blocked = (preview?.blockers.length ?? 0) > 0
  const productStaysOnPlatform =
    preview?.product_tenant_id != null && preview.product_tenant_id === PLATFORM_OWNER_TENANT

  return (
    <section style={box}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>판매자 이관</h2>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.6 }}>
        이 리스팅의 판매자를 외부 공급자로 넘깁니다. 리스팅 행을 그대로 두고 소유 정보만 바꾸므로
        식당 화면의 재주문 목록과 지난 주문 가격은 그대로 유지됩니다.
      </p>

      {done && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          이관 완료. listing_id 는 <code>{done}</code> 그대로입니다.
        </div>
      )}

      {!suppliers ? (
        <button type="button" style={btn} onClick={loadSuppliers} disabled={isPending}>
          {isPending ? '불러오는 중…' : '공급자 목록 불러오기'}
        </button>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={label}>이관할 공급자</div>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                setPreview(null)
                setAcknowledged(false)
              }}
              style={{ ...btn, minWidth: 260, cursor: 'pointer' }}
            >
              <option value="">선택하세요</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={label}>사유 (선택 — admin_logs 에 함께 남습니다)</div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 2026-09 공급 이관 건"
              style={{ ...btn, width: '100%', maxWidth: 420, cursor: 'text' }}
            />
          </div>

          <button type="button" style={btn} onClick={handleReview} disabled={isPending || !supplierId}>
            {isPending ? '확인 중…' : '이관 검토'}
          </button>
        </>
      )}

      {error && (
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: '#b91c1c',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </p>
      )}

      {preview && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '2px solid #111' }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>실행 전 확인</h3>

          <div style={rowStyle}>
            <span style={{ color: '#6b7280' }}>listing_id (변경되지 않음)</span>
            <code style={{ fontSize: 12 }}>{preview.listing_id}</code>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#6b7280' }}>현재 소유자</span>
            <span>
              {preview.current_owner_name ?? preview.current_owner_tenant_id.slice(0, 8)} (
              {preview.current_owner_type})
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#6b7280' }}>새 소유자</span>
            <span style={{ fontWeight: 700 }}>{targetName || supplierId.slice(0, 8)} (approved_supplier)</span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#6b7280' }}>이 리스팅의 과거 주문 라인</span>
            <span>
              {preview.order_item_count}건 (정산 확정 {preview.settled_order_item_count}건) — 수정하지 않음
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ color: '#6b7280' }}>product_id (변경되지 않음)</span>
            <code style={{ fontSize: 12 }}>{preview.product_id ?? '-'}</code>
          </div>

          {productStaysOnPlatform && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              이 리스팅의 상품(products)은 플랫폼 tenant 소유로 남습니다. 정산 대상은 새 공급자로
              바뀌지만, 원가(product_costs)는 여전히 플랫폼 상품에 묶여 있어 구독 할인 계산의 원가
              기준이 새 공급자의 매입가와 다를 수 있습니다. 상품 이관 방침은 별도 결정 사항입니다.
            </div>
          )}

          {blocked ? (
            <div
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <strong>이관할 수 없습니다.</strong> 아직 정산이 만들어지지 않은 주문이{' '}
              {preview.blockers.length}건 있습니다. 지금 이관하면 이 주문들이 결제 완료될 때
              이관 전 주문인데도 새 공급자에게 정산됩니다.
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {preview.blockers.map((b) => (
                  <li key={b.commerce_order_item_id}>
                    {b.order_number ?? b.order_id.slice(0, 8)} · {b.status} / {b.payment_status}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 8 }}>
                해당 주문을 결제 완료 또는 취소로 정리한 뒤 다시 시도해 주세요.
              </div>
            </div>
          ) : (
            <>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginTop: 14,
                  fontSize: 13,
                  cursor: 'pointer',
                  lineHeight: 1.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  이 리스팅의 판매자를 <strong>{targetName || supplierId.slice(0, 8)}</strong> 로 넘기고,
                  이후 발생하는 주문의 정산이 이 공급자에게 귀속되는 것에 동의합니다. 되돌리려면
                  같은 화면에서 다시 이관해야 합니다.
                </span>
              </label>

              <button
                type="button"
                style={{ ...dangerBtn, marginTop: 12, opacity: acknowledged && !isPending ? 1 : 0.5 }}
                onClick={handleTransfer}
                disabled={!acknowledged || isPending}
              >
                {isPending ? '이관 중…' : '이관 실행'}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
