'use client'

import { useCallback, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { getOrderForExport } from '@/actions/order-export'
import { OrderStatementPdfDoc } from '@/components/order/OrderStatementPDF'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function OrderStatementExportButtons({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState<'pdf' | 'print' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const buildPdfBlob = useCallback(async () => {
    const res = await getOrderForExport(orderId)
    if (!res.success || !res.data) throw new Error(res.error ?? '주문 조회 실패')
    return pdf(<OrderStatementPdfDoc data={res.data} />).toBlob()
  }, [orderId])

  const runPdf = useCallback(async () => {
    setErr(null)
    setLoading('pdf')
    try {
      const blob = await buildPdfBlob()
      downloadBlob(blob, `거래명세서_${orderId}.pdf`)
    } catch (e: any) {
      setErr(e?.message ?? 'PDF 생성 실패')
    } finally {
      setLoading(null)
    }
  }, [buildPdfBlob, orderId])

  const runPrint = useCallback(async () => {
    setErr(null)
    setLoading('print')
    try {
      const blob = await buildPdfBlob()
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) {
        URL.revokeObjectURL(url)
        throw new Error('팝업이 차단되었습니다. 브라우저 팝업을 허용해주세요.')
      }
      const tryPrint = () => {
        try {
          w.focus()
          w.print()
        } catch {
          // ignore
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      // PDF 로드 후 인쇄 시도
      setTimeout(tryPrint, 800)
    } catch (e: any) {
      setErr(e?.message ?? '인쇄 준비 실패')
    } finally {
      setLoading(null)
    }
  }, [buildPdfBlob])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={runPdf}
        disabled={loading !== null}
        style={{
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          color: '#374151',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'pdf' ? 'PDF 생성 중…' : '거래명세서 PDF'}
      </button>
      <button
        type="button"
        onClick={runPrint}
        disabled={loading !== null}
        style={{
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          color: '#374151',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading === 'print' ? '인쇄 준비 중…' : '거래명세서 인쇄'}
      </button>
      {err ? (
        <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{err}</span>
      ) : null}
    </div>
  )
}
