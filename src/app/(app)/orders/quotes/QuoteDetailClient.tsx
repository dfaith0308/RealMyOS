'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { convertQuoteToOrder, deleteQuote } from '@/actions/quote'
import type { QuoteDetail, QuoteItem } from '@/types/quote'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:               { label: '초안',     color: '#6b7280' },
  sent:                { label: '발송됨',   color: '#2563EB' },
  partially_converted: { label: '일부전환', color: '#D97706' },
  converted:           { label: '전환완료', color: '#16A34A' },
  expired:             { label: '만료',     color: '#DC2626' },
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending:             '대기',
  partially_converted: '일부전환',
  converted:           '완료',
}

function formatKRW(n: number) { return n.toLocaleString() + '원' }

interface ConversionState { checked: boolean; qty: number; price: number }

export default function QuoteDetailClient({ quote }: { quote: QuoteDetail }) {
  const router = useRouter()
  const [showConvert, setShowConvert] = useState(false)
  const [converting, setConverting]   = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState<string | null>(null)

  const [convState, setConvState] = useState<Record<string, ConversionState>>(
    Object.fromEntries(
      quote.items.map((item) => [
        item.id,
        {
          checked: item.status !== 'converted',
          qty:     item.quantity - item.converted_quantity,
          price:   item.quoted_price,
        },
      ])
    )
  )

  const printRef = useRef<HTMLDivElement>(null)

  function handlePrint() { window.print() }
  function handleDownloadJpg() {
    alert('브라우저 프린트 → "PDF로 저장" 또는 스크린샷으로 JPG 저장하세요.')
    window.print()
  }

  const st = STATUS_LABEL[quote.status] ?? { label: quote.status, color: '#6b7280' }
  const canConvert = quote.status !== 'converted' && quote.status !== 'expired'

  async function handleConvert() {
    const selected = quote.items.filter((item) => convState[item.id]?.checked && convState[item.id]?.qty > 0)
    if (!selected.length) { setError('전환할 항목을 선택해주세요.'); return }

    setConverting(true); setError(null)
    const res = await convertQuoteToOrder({
      quote_id: quote.id,
      conversions: selected.map((item) => ({
        item_id:      item.id,
        qty:          convState[item.id].qty,
        quoted_price: convState[item.id].price,
        tax_type:     item.tax_type,
        product_id:   item.product_id ?? '',
        product_code: item.product_code,
        product_name: item.product_name,
      })),
    })

    if (res.success) {
      setSuccess(`주문 ${res.data!.order_number} 생성 완료`)
      setShowConvert(false)
      router.refresh()
    } else {
      setError(res.error ?? '전환 실패')
    }
    setConverting(false)
  }

  async function handleDelete() {
    if (!confirm('이 견적을 삭제하시겠습니까?')) return
    await deleteQuote(quote.id)
    router.push('/orders/quotes')
  }

  return (
    <>
      <style>{`
        @media print {
          /* 프린트 시 사이드바, 네비 등 전체 숨김 */
          body * { visibility: hidden; }
          .quote-print-area, .quote-print-area * { visibility: visible; }
          .quote-print-area {
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            padding: 20mm 15mm;
            box-sizing: border-box;
          }
          .no-print { display: none !important; }
          /* A4 기준 페이지 설정 */
          @page {
            size: A4;
            margin: 15mm;
          }
        }
      `}</style>
    <div className="quote-print-area" style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system, "Noto Sans KR", sans-serif' }}>
      {/* 인쇄용 타이틀 — 화면에서는 숨김 */}
      <div style={{ display: 'none' }} className="print-only">
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>견 적 서</div>
      </div>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>견적서</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{quote.customer_name}</h1>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 13, color: '#6b7280' }}>
            <span>등록: {quote.created_at.slice(0, 10)}</span>
            {quote.expires_at && <span>유효기간: {quote.expires_at}</span>}
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: st.color + '20', color: st.color, fontWeight: 600 }}>
            {st.label}
          </span>
          <button onClick={handlePrint}
            style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
            🖨️ 인쇄/PDF
          </button>
          {canConvert && (
            <button onClick={() => setShowConvert((v) => !v)}
              style={{ padding: '8px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              주문으로 전환
            </button>
          )}
          {quote.status !== 'converted' && (
            <button onClick={handleDelete}
              style={{ padding: '8px 12px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#DC2626', cursor: 'pointer' }}>
              삭제
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {success && <div style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{success}</div>}

      {/* 전환 UI */}
      {showConvert && (<div className="no-print">{
        <div style={{ border: '2px solid #2563EB', borderRadius: 10, padding: 16, marginBottom: 20, background: '#F0F9FF' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1D4ED8', marginBottom: 12 }}>주문 전환 — 항목 선택</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['선택', '상품', '전환 수량', '단가', '합계'].map((h) => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #BFDBFE' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.filter((item) => item.status !== 'converted').map((item) => {
                const cs = convState[item.id]
                const remaining = item.quantity - item.converted_quantity
                const lineTotal = cs.price * cs.qty
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #E0F2FE' }}>
                    <td style={{ padding: '7px 10px' }}>
                      <input type="checkbox" checked={cs.checked}
                        onChange={(e) => setConvState((prev) => ({ ...prev, [item.id]: { ...prev[item.id], checked: e.target.checked } }))} />
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>
                      {item.product_name}
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{item.product_code}</div>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <input type="number" min={1} max={remaining}
                        style={{ width: 70, padding: '4px 6px', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                        value={cs.qty}
                        disabled={!cs.checked}
                        onChange={(e) => {
                          const v = Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), remaining)
                          setConvState((prev) => ({ ...prev, [item.id]: { ...prev[item.id], qty: v } }))
                        }} />
                      <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>/ {remaining}</span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <input type="number" min={0}
                        style={{ width: 90, padding: '4px 6px', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                        value={cs.price}
                        disabled={!cs.checked}
                        onChange={(e) => {
                          const v = Math.max(0, parseInt(e.target.value, 10) || 0)
                          setConvState((prev) => ({ ...prev, [item.id]: { ...prev[item.id], price: v } }))
                        }} />
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {cs.checked ? lineTotal.toLocaleString() + '원' : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button onClick={() => setShowConvert(false)}
              style={{ padding: '9px 16px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>취소</button>
            <button onClick={handleConvert} disabled={converting}
              style={{ padding: '9px 20px', background: converting ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {converting ? '전환 중...' : '주문 생성'}
            </button>
          </div>
        </div>
      )}

      {/* 견적 항목 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['상품', '수량', '단가', '합계', '전환됨', '상태'].map((h) => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: item.status === 'converted' ? 0.5 : 1 }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                  {item.product_name}
                  <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{item.product_code}</div>
                </td>
                <td style={{ padding: '10px 14px' }}>{item.quantity}</td>
                <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{item.quoted_price.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{item.line_total.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{item.converted_quantity} / {item.quantity}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: item.status === 'converted' ? '#DCFCE7' : item.status === 'partially_converted' ? '#FEF3C7' : '#F3F4F6', color: item.status === 'converted' ? '#15803D' : item.status === 'partially_converted' ? '#92400E' : '#6b7280' }}>
                    {ITEM_STATUS_LABEL[item.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 합계 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, fontSize: 13 }}>
        <span style={{ color: '#6b7280' }}>견적 합계</span>
        <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatKRW(quote.total_amount)}</span>
      </div>

      {quote.memo && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#f9fafb', borderRadius: 8, fontSize: 13, color: '#374151' }}>
          <span style={{ fontWeight: 500 }}>메모:</span> {quote.memo}
        </div>
      )}
    </div>
    </>
  )
}
