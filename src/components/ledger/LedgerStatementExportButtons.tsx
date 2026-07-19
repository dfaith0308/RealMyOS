'use client'

// 3rd copy — OrderStatementExportButtons.tsx, QuoteExportButton 참고. 4번째 문서 타입 생기면 공유 모듈 검토 필요

import { useCallback, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { getCustomerLedgerForExport } from '@/actions/ledger-export'
import { LedgerStatementPdfDoc } from '@/components/ledger/LedgerStatementPDF'

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

export default function LedgerStatementExportButtons({
  customerId,
  from,
  to,
}: {
  customerId: string
  from: string
  to: string
}) {
  const [loading, setLoading] = useState<'pdf' | 'jpg' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(
    async (kind: 'pdf' | 'jpg') => {
      setErr(null)
      setLoading(kind)
      try {
        const res = await getCustomerLedgerForExport(customerId, { from, to })
        if (!res.success || !res.data) throw new Error(res.error ?? '원장 조회 실패')

        const pdfBlob = await pdf(<LedgerStatementPdfDoc data={res.data} />).toBlob()
        const safeName = (res.data.buyer.name || '거래처').replace(/[\\/:*?"<>|]/g, '_')

        if (kind === 'pdf') {
          downloadBlob(pdfBlob, `원장명세서_${safeName}_${from}_${to}.pdf`)
        } else {
          const jpgBlob = await pdfBlobToJpgBlob(pdfBlob)
          downloadBlob(jpgBlob, `원장명세서_${safeName}_${from}_${to}.jpg`)
        }
      } catch (e: any) {
        setErr(e?.message ?? '다운로드 실패')
      } finally {
        setLoading(null)
      }
    },
    [customerId, from, to],
  )

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => run('pdf')}
        disabled={loading !== null}
        style={{
          height: 32,
          padding: '0 12px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          color: '#374151',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading === 'pdf' ? 'PDF 생성 중…' : 'PDF 다운로드'}
      </button>
      <button
        type="button"
        onClick={() => run('jpg')}
        disabled={loading !== null}
        style={{
          height: 32,
          padding: '0 12px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          color: '#374151',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
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
