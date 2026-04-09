'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkCreateProducts } from '@/actions/product'
import type { BulkProductRow } from '@/actions/product'

const TEMPLATE_HEADER = 'name,cost_price,selling_price,siksiki_price,subscription_price,bulk_price,bulk_min_quantity,tax_type,category_name'
const TEMPLATE_EXAMPLE = [
  '해남 고추가루 1kg,8800,11900,11000,10500,10000,10,taxable,고추가루',
  '국내산 들기름 500ml,6500,9900,,9000,,, taxable,기름류',
  '두부 300g,800,1200,,,,, exempt,두부류',
].join('\n')

function parseCSV(text: string): BulkProductRow[] {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []

  // 헤더 있으면 제거
  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('name') || firstLine.includes('상품명')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const num  = (v: string) => { const n = Number(v); return isNaN(n) ? undefined : n }
    return {
      name:               cols[0] ?? '',
      cost_price:         num(cols[1]) ?? 0,
      selling_price:      num(cols[2]) ?? 0,
      siksiki_price:      num(cols[3]),
      subscription_price: num(cols[4]),
      bulk_price:         num(cols[5]),
      bulk_min_quantity:  cols[6] ? Math.floor(num(cols[6]) ?? 0) : undefined,
      tax_type:           (cols[7]?.toLowerCase() === 'exempt' ? 'exempt' : 'taxable') as 'taxable' | 'exempt',
      category_name:      cols[8] || undefined,
    }
  }).filter((r) => r.name)
}

function downloadTemplate() {
  const content = `${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'product_bulk_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function ProductBulkUpload() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<BulkProductRow[]>([])
  const [result, setResult] = useState<{ success: number; fail: number; errors: any[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleTextChange(v: string) {
    setText(v)
    setResult(null)
    setPreview(parseCSV(v).slice(0, 5))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      handleTextChange(content)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  function handleSubmit() {
    const rows = parseCSV(text)
    if (!rows.length) { setError('등록할 상품이 없습니다. CSV 형식을 확인해주세요.'); return }
    setError(null)

    startTransition(async () => {
      const r = await bulkCreateProducts(rows)
      if (r.success && r.data) {
        setResult({ success: r.data.success_count, fail: r.data.fail_count, errors: r.data.fail_rows })
        if (r.data.success_count > 0) { setText(''); setPreview([]) }
        router.refresh()
      } else {
        setError(r.error ?? '저장 실패')
      }
    })
  }

  const rowCount = parseCSV(text).length

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>상품 대량등록</h2>
          <p style={s.desc}>CSV 파일 업로드 또는 직접 붙여넣기</p>
        </div>
        <button type="button" style={s.templateBtn} onClick={downloadTemplate}>
          📥 CSV 템플릿 다운로드
        </button>
      </div>

      {/* 파일 업로드 */}
      <label style={s.fileArea}>
        <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>📂 CSV 파일 선택 또는 클릭</span>
      </label>

      {/* 텍스트 붙여넣기 */}
      <div>
        <div style={s.textareaHeader}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>또는 CSV 직접 붙여넣기</span>
          {rowCount > 0 && <span style={s.countBadge}>{rowCount}개 상품 인식</span>}
        </div>
        <textarea style={s.textarea} value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`}
          rows={8} />
      </div>

      {/* 미리보기 */}
      {preview.length > 0 && (
        <div style={s.previewBox}>
          <p style={s.previewTitle}>미리보기 (최대 5행)</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['상품명','매입가','판매가','과세','카테고리'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.cost_price.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.selling_price.toLocaleString()}</td>
                  <td style={td}>{r.tax_type === 'exempt' ? '면세' : '과세'}</td>
                  <td style={td}>{r.category_name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rowCount > 5 && <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0 0' }}>외 {rowCount - 5}개</p>}
        </div>
      )}

      {error && <div style={s.err}>{error}</div>}

      {/* 결과 */}
      {result && (
        <div style={result.fail > 0 ? s.warnBox : s.okBox}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
            {result.success}건 성공 {result.fail > 0 ? `/ ${result.fail}건 실패` : ''}
          </p>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.errors.map((e, i) => (
                <p key={i} style={{ margin: 0, fontSize: 12, color: '#B91C1C' }}>
                  {e.row}행 {e.name}: {e.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="button"
        style={isPending || !rowCount ? s.btnOff : s.btn}
        onClick={handleSubmit} disabled={isPending || !rowCount}>
        {isPending ? '등록 중...' : `${rowCount}개 상품 등록`}
      </button>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 500, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }
const td: React.CSSProperties = { padding: '7px 10px' }
const s: Record<string, React.CSSProperties> = {
  wrap:          { maxWidth: 720, margin: '0 auto', padding: '32px 24px 60px', display: 'flex', flexDirection: 'column', gap: 16 },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:         { fontSize: 18, fontWeight: 600, margin: 0 },
  desc:          { fontSize: 13, color: '#9ca3af', margin: '4px 0 0 0' },
  templateBtn:   { padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' },
  fileArea:      { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, border: '2px dashed #d1d5db', borderRadius: 10, cursor: 'pointer', background: '#fafafa' },
  textareaHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  textarea:      { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box', color: '#374151' },
  countBadge:    { fontSize: 11, padding: '2px 8px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 8, fontWeight: 600 },
  previewBox:    { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
  previewTitle:  { fontSize: 12, fontWeight: 600, color: '#6b7280', margin: 0, padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' },
  err:           { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  okBox:         { background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '12px 14px' },
  warnBox:       { background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 14px' },
  btn:           { padding: '12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  btnOff:        { padding: '12px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'not-allowed' },
}
