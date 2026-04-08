'use client'

// ============================================================
// RealMyOS - 거래처 대량등록 컴포넌트
// src/components/customer/CustomerBulkUpload.tsx
// ============================================================

import { useState, useTransition, useRef } from 'react'
import { bulkUpsertCustomers } from '@/actions/customer-bulk'
import { downloadCustomerCsvTemplate, CUSTOMER_CSV_HEADERS } from '@/lib/customer-csv'
import type { BulkCustomerRow, BulkResult } from '@/actions/customer-bulk'

export default function CustomerBulkUpload({ onDone }: { onDone?: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<BulkResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? ''
      const rows = parseCSV(text)
      if (rows.length === 0) { setParseError('파싱된 데이터가 없습니다.'); return }

      startTransition(async () => {
        const res = await bulkUpsertCustomers(rows)
        if (res.success && res.data) {
          setResult(res.data)
          onDone?.()
        } else {
          setParseError(res.error ?? '업로드 실패')
        }
      })
    }
    reader.readAsText(file, 'UTF-8')
    // input 초기화 (같은 파일 재업로드 가능)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 버튼 2개 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={s.dlBtn}
          onClick={downloadCustomerCsvTemplate}
        >
          ⬇ 양식 다운로드
        </button>
        <button
          type="button"
          style={isPending ? s.upBtnOff : s.upBtn}
          disabled={isPending}
          onClick={() => fileRef.current?.click()}
        >
          {isPending ? '업로드 중...' : '⬆ CSV 업로드'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      {/* 파싱 에러 */}
      {parseError && (
        <div style={s.err}>{parseError}</div>
      )}

      {/* 결과 */}
      {result && (
        <div style={s.resultBox}>
          <div style={s.resultSummary}>
            <span style={{ color: '#15803D', fontWeight: 600 }}>
              ✅ 성공 {result.success_count}건
            </span>
            {result.warning_count > 0 && (
              <span style={{ color: '#B45309', fontWeight: 600 }}>
                · ⚠️ 중복가능성 {result.warning_count}건
              </span>
            )}
            {result.fail_count > 0 && (
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>
                · ❌ 실패 {result.fail_count}건
              </span>
            )}
          </div>

          {result.warning_rows.length > 0 && (
            <table style={s.warnTable}>
              <thead>
                <tr>
                  <th style={twh}>행</th>
                  <th style={twh}>이름</th>
                  <th style={twh}>경고 내용</th>
                </tr>
              </thead>
              <tbody>
                {result.warning_rows.map((w, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #fde68a' }}>
                    <td style={td}>{w.row}</td>
                    <td style={td}>{w.name || '-'}</td>
                    <td style={{ ...td, color: '#B45309' }}>{w.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.failures.length > 0 && (
            <table style={s.failTable}>
              <thead>
                <tr>
                  <th style={th}>행</th>
                  <th style={th}>이름</th>
                  <th style={th}>실패 이유</th>
                </tr>
              </thead>
              <tbody>
                {result.failures.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                    <td style={td}>{f.row}</td>
                    <td style={td}>{f.name || '-'}</td>
                    <td style={{ ...td, color: '#B91C1C' }}>{f.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── CSV 파서 (papaparse 없이 직접 구현) ─────────────────────────

function parseCSV(text: string): BulkCustomerRow[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))

  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: BulkCustomerRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i])
    if (values.every((v) => !v.trim())) continue // 빈 줄 skip

    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? ''
    })

    // CUSTOMER_CSV_HEADERS 기준으로만 파싱
    rows.push({
      business_number:        row.business_number || undefined,
      customer_type:          row.customer_type || undefined,
      name:                   row.name ?? '',
      representative_name:    row.representative_name || undefined,
      phone:                  row.phone || undefined,
      address:                row.address || undefined,
      business_type:          row.business_type || undefined,
      payment_terms_type:     row.payment_terms_type || undefined,
      payment_day:            row.payment_day || undefined,
      payment_terms_days:     row.payment_terms_days || undefined,
      opening_balance:        row.opening_balance || undefined,
      opening_balance_date:   row.opening_balance_date || undefined,
      target_monthly_revenue: row.target_monthly_revenue || undefined,
      acquisition_channel:    row.acquisition_channel || undefined,
    })
  }

  return rows
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ── 스타일 ───────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  dlBtn:      { padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' },
  upBtn:      { padding: '8px 14px', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
  upBtnOff:   { padding: '8px 14px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' },
  err:        { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13 },
  resultBox:  { border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  resultSummary: { display: 'flex', gap: 12, fontSize: 14 },
  failTable:  { width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#FFF1F2', borderRadius: 8, overflow: 'hidden' },
  warnTable:  { width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#FFFBEB', borderRadius: 8, overflow: 'hidden' },
}
const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#FEE2E2' }
const twh: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#FDE68A' }
const td: React.CSSProperties = { padding: '6px 10px', verticalAlign: 'middle' }