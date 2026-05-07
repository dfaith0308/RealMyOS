'use client'

import { useCallback, useState } from 'react'
import { pdf, Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import { getQuoteForExport, logQuoteExport, type QuoteForExport } from '@/actions/quote-export'

Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/notosanskr/v36/Pby6FmXiEBPT4ITbgNA5CgmOelzI7xjv.woff2' },
  ],
})

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'NotoSansKR', fontSize: 11, color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 18, fontWeight: 700 },
  muted: { color: '#6b7280' },
  box: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10 },
  tableHead: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  tr: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  th: { fontSize: 10, fontWeight: 700, color: '#6b7280' },
  td: { fontSize: 11 },
})

function formatKRW(n: number) {
  return (n ?? 0).toLocaleString() + '원'
}

function QuotePdfDoc({ data }: { data: QuoteForExport }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.row, { marginBottom: 14 }]}>
          <View style={{ gap: 4 }}>
            <Text style={styles.muted}>견적서</Text>
            <Text style={styles.h1}>{data.customer_name}</Text>
            <Text style={styles.muted}>
              견적일 {data.quote_date}
              {data.expires_at ? ` · 유효기간 ${data.expires_at}` : ''}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            {data.company.logo_url ? (
              <Image src={data.company.logo_url} style={{ width: 110, height: 36, objectFit: 'contain' }} />
            ) : null}
            <Text style={{ fontSize: 10, color: '#111827', fontWeight: 700 }}>
              {data.company.company_name ?? ''}
            </Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>
              {[data.company.contact_phone, data.company.contact_email].filter(Boolean).join(' · ')}
            </Text>
            {data.company.address ? (
              <Text style={{ fontSize: 9, color: '#6b7280' }}>{data.company.address}</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.box, { padding: 0, overflow: 'hidden' }]}>
          <View style={styles.tableHead}>
            <View style={{ width: '46%', paddingHorizontal: 10 }}>
              <Text style={styles.th}>상품</Text>
            </View>
            <View style={{ width: '14%', paddingHorizontal: 10, textAlign: 'right' as any }}>
              <Text style={styles.th}>수량</Text>
            </View>
            <View style={{ width: '20%', paddingHorizontal: 10, textAlign: 'right' as any }}>
              <Text style={styles.th}>단가</Text>
            </View>
            <View style={{ width: '20%', paddingHorizontal: 10, textAlign: 'right' as any }}>
              <Text style={styles.th}>합계</Text>
            </View>
          </View>

          {data.items.map((it, idx) => (
            <View key={`${it.product_name}-${idx}`} style={styles.tr}>
              <View style={{ width: '46%', paddingHorizontal: 10 }}>
                <Text style={styles.td}>{it.product_name}</Text>
              </View>
              <View style={{ width: '14%', paddingHorizontal: 10, textAlign: 'right' as any }}>
                <Text style={styles.td}>{it.quantity}</Text>
              </View>
              <View style={{ width: '20%', paddingHorizontal: 10, textAlign: 'right' as any }}>
                <Text style={styles.td}>{(it.unit_price ?? 0).toLocaleString()}</Text>
              </View>
              <View style={{ width: '20%', paddingHorizontal: 10, textAlign: 'right' as any }}>
                <Text style={[styles.td, { fontWeight: 700 }]}>{(it.line_total ?? 0).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, alignItems: 'baseline' }}>
          <Text style={{ color: '#6b7280' }}>총 금액</Text>
          <Text style={{ fontSize: 18, fontWeight: 700 }}>{formatKRW(data.total_amount)}</Text>
        </View>

        {data.memo ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: '#374151', marginBottom: 6 }}>메모</Text>
            <View style={[styles.box, { backgroundColor: '#f9fafb' }]}>
              <Text style={{ fontSize: 11 }}>{data.memo}</Text>
            </View>
          </View>
        ) : null}

        {data.company.stamp_url ? (
          <View style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>도장</Text>
            <Image src={data.company.stamp_url} style={{ width: 90, height: 90, objectFit: 'contain' }} />
          </View>
        ) : null}
      </Page>
    </Document>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function pdfBlobToJpgBlob(pdfBlob: Blob): Promise<Blob> {
  const arr = await pdfBlob.arrayBuffer()
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: arr, disableWorker: true }).promise
  const page = await doc.getPage(1)

  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas context 생성 실패')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: ctx as any, viewport }).promise

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPG 변환 실패'))), 'image/jpeg', 0.92)
  })
}

export default function QuoteExportButton({ quoteId }: { quoteId: string }) {
  const [loading, setLoading] = useState<'pdf' | 'jpg' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async (kind: 'pdf' | 'jpg') => {
    setErr(null)
    setLoading(kind)
    try {
      const res = await getQuoteForExport(quoteId)
      if (!res.success || !res.data) throw new Error(res.error ?? '견적 조회 실패')

      const doc = <QuotePdfDoc data={res.data} />
      const pdfBlob = await pdf(doc).toBlob()

      if (kind === 'pdf') {
        downloadBlob(pdfBlob, `quote_${quoteId}.pdf`)
        await logQuoteExport(quoteId, 'pdf')
      } else {
        const jpgBlob = await pdfBlobToJpgBlob(pdfBlob)
        downloadBlob(jpgBlob, `quote_${quoteId}.jpg`)
        await logQuoteExport(quoteId, 'jpg')
      }
    } catch (e: any) {
      setErr(e?.message ?? '다운로드 실패')
    } finally {
      setLoading(null)
    }
  }, [quoteId])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => run('pdf')}
        disabled={loading !== null}
        style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}
      >
        {loading === 'pdf' ? 'PDF 생성 중…' : 'PDF 다운로드'}
      </button>
      <button
        type="button"
        onClick={() => run('jpg')}
        disabled={loading !== null}
        style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}
      >
        {loading === 'jpg' ? 'JPG 생성 중…' : 'JPG 다운로드'}
      </button>
      {err ? (
        <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
          {err}
        </span>
      ) : null}
    </div>
  )
}

