'use client'

import { useCallback, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { bulkCreateListings, type BulkListingRow } from '@/actions/admin/bulk-listing'
import { parseBulkListingWorkbook } from '@/lib/bulk-listing-parse-xlsx'

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
  const [sheetName, setSheetName] = useState<string | null>(null)
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
    setSheetName(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const buffer = ev.target?.result
        if (!(buffer instanceof ArrayBuffer)) {
          setParseError('파일을 읽을 수 없습니다')
          setRows([])
          return
        }
        const parsed = parseBulkListingWorkbook(buffer)
        setSheetName(parsed.sheetName)
        if (!parsed.rows.length) {
          setParseError(
            '등록할 데이터 행이 없습니다. 「상품등록」시트의 영문키 헤더 아래 설명행 1개 후 데이터가 시작되는지 확인해 주세요.',
          )
        }
        setRows(parsed.rows)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : '엑셀 파싱에 실패했습니다')
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
          .xlsx / .xls · 「상품등록」시트 우선 · 영문키 헤더 자동 감지
        </p>
        {fileName ? (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#1f5d3a', fontWeight: 600 }}>
            {fileName}
            {sheetName ? ` · 시트: ${sheetName}` : ''}
          </p>
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
              {sheetName ? ` · 시트「${sheetName}」` : ''}
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
