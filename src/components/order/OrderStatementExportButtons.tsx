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

/** PDF → JPG. pdfjs v5 worker는 .min.mjs (cdnjs .min.js는 404) */
async function pdfBlobToJpgBlob(pdfBlob: Blob): Promise<Blob> {
  const arr = await pdfBlob.arrayBuffer()
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const version = pdfjs.version ?? '5.7.284'
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`
  }
  const doc = await pdfjs.getDocument({ data: arr }).promise
  const page = await doc.getPage(1)

  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas context 생성 실패')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx as any, viewport }).promise

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPG 변환 실패'))), 'image/jpeg', 0.92)
  })
}

export default function OrderStatementExportButtons({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState<'pdf' | 'jpg' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async (kind: 'pdf' | 'jpg') => {
    setErr(null)
    setLoading(kind)
    try {
      const res = await getOrderForExport(orderId)
      if (!res.success || !res.data) throw new Error(res.error ?? '주문 조회 실패')

      const pdfBlob = await pdf(<OrderStatementPdfDoc data={res.data} />).toBlob()

      if (kind === 'pdf') {
        downloadBlob(pdfBlob, `거래명세서_${orderId}.pdf`)
      } else {
        const jpgBlob = await pdfBlobToJpgBlob(pdfBlob)
        downloadBlob(jpgBlob, `거래명세서_${orderId}.jpg`)
      }
    } catch (e: any) {
      setErr(e?.message ?? '다운로드 실패')
    } finally {
      setLoading(null)
    }
  }, [orderId])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => run('pdf')}
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
        {loading === 'pdf' ? 'PDF 생성 중…' : 'PDF 다운로드'}
      </button>
      <button
        type="button"
        onClick={() => run('jpg')}
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
        {loading === 'jpg' ? '이미지 생성 중…' : '이미지 다운로드'}
      </button>
      {err ? (
        <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{err}</span>
      ) : null}
    </div>
  )
}
