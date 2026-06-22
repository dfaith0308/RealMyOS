'use client'

import { useCallback, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { bulkCreateListings, type BulkListingRow } from '@/actions/admin/bulk-listing'

const COLUMN_MAP: Record<string, keyof Omit<BulkListingRow, 'row_number'>> = {
  brand_name: 'brand_name',
  product_name: 'product_name',
  spec: 'spec',
  category: 'category',
  sub_category: 'sub_category',
  supply_price: 'supply_price',
  commerce_price: 'commerce_price',
  base_shipping_fee: 'base_shipping_fee',
  original_price: 'original_price',
  free_shipping_qty: 'free_shipping_qty',
  bulk_qty: 'bulk_qty',
  bulk_discount_rate: 'bulk_discount_rate',
  box_qty: 'box_qty',
  storage_method: 'storage_method',
  ingredients: 'ingredients',
  manufacturer: 'manufacturer',
  usage_desc: 'usage_desc',
  barcode: 'barcode',
  item_report_number: 'item_report_number',
  thumbnail_url: 'thumbnail_url',
}

const NUMERIC_FIELDS = new Set<keyof BulkListingRow>([
  'supply_price',
  'commerce_price',
  'base_shipping_fee',
  'original_price',
  'free_shipping_qty',
  'bulk_qty',
  'bulk_discount_rate',
  'box_qty',
  'row_number',
])

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function parseNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : undefined
}

function rowHasError(row: BulkListingRow): boolean {
  if (!cellStr(row.product_name)) return true
  if (!parseNumber(row.commerce_price) || row.commerce_price <= 0) return true
  if (!parseNumber(row.supply_price) || row.supply_price <= 0) return true
  if (!parseNumber(row.base_shipping_fee) || row.base_shipping_fee <= 0) return true
  if (!cellStr(row.category)) return true
  return false
}

function parseWorkbook(buffer: ArrayBuffer): BulkListingRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (matrix.length < 5) return []

  const headerRow = matrix[2]
  if (!Array.isArray(headerRow)) return []

  const colIndex: Partial<Record<keyof Omit<BulkListingRow, 'row_number'>, number>> = {}
  headerRow.forEach((header, idx) => {
    const key = cellStr(header).toLowerCase()
    const field = COLUMN_MAP[key]
    if (field) colIndex[field] = idx
  })

  const rows: BulkListingRow[] = []

  for (let i = 4; i < matrix.length; i++) {
    const line = matrix[i]
    if (!Array.isArray(line)) continue

    const partial: Partial<BulkListingRow> = { row_number: i + 1 }

    for (const [field, idx] of Object.entries(colIndex) as [keyof Omit<BulkListingRow, 'row_number'>, number][]) {
      const raw = line[idx]
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseNumber(raw)
        if (n !== undefined) (partial as Record<string, unknown>)[field] = Math.round(n)
      } else {
        const s = cellStr(raw)
        if (s) (partial as Record<string, unknown>)[field] = s
      }
    }

    if (!cellStr(partial.product_name)) continue

    rows.push({
      row_number: partial.row_number ?? i + 1,
      product_name: cellStr(partial.product_name),
      brand_name: partial.brand_name,
      spec: partial.spec,
      category: partial.category,
      sub_category: partial.sub_category,
      supply_price: partial.supply_price ?? 0,
      commerce_price: partial.commerce_price ?? 0,
      base_shipping_fee: partial.base_shipping_fee ?? 0,
      original_price: partial.original_price,
      free_shipping_qty: partial.free_shipping_qty,
      bulk_qty: partial.bulk_qty,
      bulk_discount_rate: partial.bulk_discount_rate,
      box_qty: partial.box_qty,
      storage_method: partial.storage_method,
      ingredients: partial.ingredients,
      manufacturer: partial.manufacturer,
      usage_desc: partial.usage_desc,
      barcode: partial.barcode,
      item_report_number: partial.item_report_number,
      thumbnail_url: partial.thumbnail_url,
    })
  }

  return rows
}

const th: CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
}

const td: CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  borderBottom: '1px solid #f3f4f6',
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export default function BulkListingUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkListingRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = useState<{
    created: number
    updated: number
    failed: { row: number; reason: string }[]
  } | null>(null)

  const processFile = useCallback((file: File) => {
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setParseError('xlsx 또는 xls 파일만 업로드할 수 있습니다')
      return
    }

    setParseError(null)
    setResult(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result
        if (!(buffer instanceof ArrayBuffer)) {
          setParseError('파일을 읽을 수 없습니다')
          setRows([])
          return
        }
        const parsed = parseWorkbook(buffer)
        if (!parsed.length) {
          setParseError('등록할 데이터 행이 없습니다. 3행 영문키·5행부터 데이터인지 확인해 주세요.')
        }
        setRows(parsed)
      } catch {
        setParseError('엑셀 파싱에 실패했습니다')
        setRows([])
      }
    }
    reader.onerror = () => {
      setParseError('파일 읽기 오류')
      setRows([])
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleSubmit = () => {
    if (!rows.length) {
      setParseError('등록할 상품이 없습니다')
      return
    }

    setParseError(null)
    setResult(null)
    setProgress({ current: 0, total: rows.length })

    startTransition(async () => {
      let created = 0
      let updated = 0
      const failed: { row: number; reason: string }[] = []

      for (let i = 0; i < rows.length; i++) {
        setProgress({ current: i + 1, total: rows.length })
        const res = await bulkCreateListings([rows[i]!])
        if (!res.success) {
          failed.push({ row: rows[i]!.row_number, reason: res.error ?? '처리 실패' })
          continue
        }
        created += res.data?.created ?? 0
        updated += res.data?.updated ?? 0
        failed.push(...(res.data?.failed ?? []))
      }

      setProgress(null)
      setResult({ created, updated, failed })
      router.refresh()
    })
  }

  const preview = rows.slice(0, 5)
  const invalidCount = rows.filter(rowHasError).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #d1d5db',
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: '#fafafa',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
          엑셀 파일을 드래그하거나 클릭해서 업로드
        </p>
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
          .xlsx / .xls · 3행 영문키 · 5행부터 데이터
        </p>
        {fileName ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#1f5d3a', fontWeight: 600 }}>{fileName}</p>
        ) : null}
      </div>

      {parseError ? (
        <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{parseError}</p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
              총 {rows.length}행 감지됨
              {invalidCount > 0 ? (
                <span style={{ color: '#b91c1c', fontWeight: 500 }}> · 필수값 누락 {invalidCount}행</span>
              ) : null}
            </p>
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={th}>행</th>
                    <th style={th}>상품명</th>
                    <th style={th}>대분류</th>
                    <th style={th}>소분류</th>
                    <th style={th}>공급가</th>
                    <th style={th}>판매가</th>
                    <th style={th}>배송비</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => {
                    const bad = rowHasError(row)
                    return (
                      <tr key={row.row_number} style={{ background: bad ? '#fef2f2' : '#fff' }}>
                        <td style={td}>{row.row_number}</td>
                        <td style={td}>{row.product_name || '—'}</td>
                        <td style={td}>{row.category || '—'}</td>
                        <td style={td}>{row.sub_category || '—'}</td>
                        <td style={td}>{row.supply_price || '—'}</td>
                        <td style={td}>{row.commerce_price || '—'}</td>
                        <td style={td}>{row.base_shipping_fee || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 5 ? (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>미리보기는 최대 5행까지 표시됩니다</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || invalidCount === rows.length}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: isPending ? '#9ca3af' : '#1f5d3a',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? '등록 중…' : '등록 시작'}
          </button>
        </>
      ) : null}

      {progress ? (
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
          처리 중: {progress.current} / {progress.total}
        </p>
      ) : null}

      {result ? (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
            완료 — 등록 {result.created}건 / 업데이트 {result.updated}건 / 실패 {result.failed.length}건
          </p>
          {result.failed.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#b91c1c', lineHeight: 1.6 }}>
              {result.failed.map((f) => (
                <li key={`${f.row}-${f.reason}`}>
                  {f.row}행: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
