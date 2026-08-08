'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getLedgerTaxInvoiceSummaries,
  type LedgerCustomerOption,
  type LedgerTaxInvoiceRow,
} from '@/actions/ledger'
import { formatKRW } from '@/lib/calc'
import styles from './LedgerHubClient.module.css'

type LedgerKind = 'sales' | 'purchases'
type PaymentMethodFilter = '' | 'transfer' | 'cash' | 'card'

interface Props {
  initialKind: LedgerKind
  initialFrom: string
  initialTo: string
  initialSupplier: string
  initialPaymentMethod: PaymentMethodFilter
  initialTaxRows: LedgerTaxInvoiceRow[]
  customers: LedgerCustomerOption[]
  suppliers: string[]
}

function kstNow() {
  return new Date(Date.now() + 9 * 3600000)
}

function kstTodayStr() {
  return kstNow().toISOString().slice(0, 10)
}

function thisMonthRange() {
  const d = kstNow()
  const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
  return { from, to: kstTodayStr() }
}

function lastMonthRange() {
  const d = kstNow()
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0-based current month in KST via UTC fields of shifted date
  const lastMonthIdx = m === 0 ? 11 : m - 1
  const lastYear = m === 0 ? y - 1 : y
  const from = `${lastYear}-${String(lastMonthIdx + 1).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(lastYear, lastMonthIdx + 1, 0)).getUTCDate()
  const to = `${lastYear}-${String(lastMonthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function downloadTaxCsv(rows: LedgerTaxInvoiceRow[], from: string, to: string) {
  const header = ['거래처명', '사업자번호', '과세합계', '카드(제외)', '계산서발행']
  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.biz_number ?? ''),
      String(r.taxable_paid),
      String(r.card_paid),
      String(r.invoice_amount),
    ].join(','),
  )
  const bom = '\uFEFF'
  const blob = new Blob([bom + [header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `세금계산서요약_${from}_${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export default function LedgerHubClient({
  initialKind,
  initialFrom,
  initialTo,
  initialSupplier,
  initialPaymentMethod,
  initialTaxRows,
  customers,
  suppliers,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [kind, setKind] = useState<LedgerKind>(initialKind)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [supplier, setSupplier] = useState(initialSupplier)
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodFilter>(initialPaymentMethod)
  const [taxRows, setTaxRows] = useState<LedgerTaxInvoiceRow[]>(initialTaxRows)
  const [taxError, setTaxError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    setTaxRows(initialTaxRows)
  }, [initialTaxRows])

  const supplierOptions = useMemo(
    () => suppliers.filter((s) => s.trim().length > 0),
    [suppliers],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers
      .filter((c) => {
        if (!q) return true
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').replace(/-/g, '').includes(q.replace(/-/g, '')) ||
          (c.representative_name ?? '').toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [customers, search])

  const pushQuery = useCallback(
    (next: {
      kind?: LedgerKind
      supplier?: string
      from?: string
      to?: string
      payment_method?: PaymentMethodFilter
    }) => {
      const params = new URLSearchParams()
      const k = next.kind ?? kind
      const f = next.from ?? from
      const t = next.to ?? to
      const pm = next.payment_method ?? paymentMethod
      if (k && k !== 'sales') params.set('kind', k)
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      if (pm) params.set('payment_method', pm)
      const sup = next.supplier ?? supplier
      if (k === 'purchases' && sup) params.set('supplier', sup)
      const q = params.toString()
      router.push(q ? `/ledger?${q}` : '/ledger')
    },
    [kind, from, to, paymentMethod, supplier, router],
  )

  async function reloadTax(nextFrom: string, nextTo: string, nextMethod: PaymentMethodFilter) {
    setTaxError(null)
    const res = await getLedgerTaxInvoiceSummaries({
      from: nextFrom || undefined,
      to: nextTo || undefined,
      payment_method: nextMethod || undefined,
    })
    if (!res.success || !res.data) {
      setTaxError(res.error ?? '집계 실패')
      return
    }
    setTaxRows(res.data)
  }

  function applyFilters() {
    startTransition(() => {
      pushQuery({})
      void reloadTax(from, to, paymentMethod)
    })
  }

  function applyPreset(range: { from: string; to: string }) {
    setFrom(range.from)
    setTo(range.to)
    startTransition(() => {
      pushQuery({ from: range.from, to: range.to })
      void reloadTax(range.from, range.to, paymentMethod)
    })
  }

  function onPaymentMethodChange(pm: PaymentMethodFilter) {
    setPaymentMethod(pm)
    startTransition(() => {
      pushQuery({ payment_method: pm })
      void reloadTax(from, to, pm)
    })
  }

  function selectCustomer(id: string) {
    if (id) router.push(`/customers/${id}/ledger`)
  }

  function selectSupplier(name: string) {
    setSupplier(name)
    pushQuery({ kind: 'purchases', supplier: name })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && filtered[activeIndex]) {
        const c = filtered[activeIndex]
        setSearch(c.name)
        setOpen(false)
        setActiveIndex(-1)
        selectCustomer(c.id)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div>
      <div style={s.tabs}>
        <button
          type="button"
          style={{ ...s.tab, ...(kind === 'sales' ? s.tabActive : null) }}
          onClick={() => {
            setKind('sales')
            pushQuery({ kind: 'sales' })
          }}
        >
          매출원장
        </button>
        <button
          type="button"
          style={{ ...s.tab, ...(kind === 'purchases' ? s.tabActive : null) }}
          onClick={() => {
            setKind('purchases')
            pushQuery({ kind: 'purchases' })
          }}
        >
          매입원장
        </button>
      </div>

      <div style={s.filterRow}>
        <label style={s.lb}>기간</label>
        <button type="button" style={s.presetBtn} onClick={() => applyPreset(thisMonthRange())}>
          이번 달
        </button>
        <button type="button" style={s.presetBtn} onClick={() => applyPreset(lastMonthRange())}>
          지난 달
        </button>
        <input
          type="date"
          value={from}
          style={s.input}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
        <input
          type="date"
          value={to}
          style={s.input}
          onChange={(e) => setTo(e.target.value)}
        />
        {kind === 'sales' && (
          <>
            <label style={s.lb}>결제수단</label>
            <select
              style={s.methodSelect}
              value={paymentMethod}
              onChange={(e) => onPaymentMethodChange(e.target.value as PaymentMethodFilter)}
            >
              <option value="transfer">무통장</option>
              <option value="cash">현금</option>
              <option value="card">카드</option>
              <option value="">전체</option>
            </select>
          </>
        )}
        <button type="button" style={s.searchBtn} onClick={applyFilters} disabled={pending}>
          적용
        </button>
        <button
          type="button"
          style={s.resetBtn}
          onClick={() => router.push('/ledger')}
        >
          초기화
        </button>
      </div>

      {kind === 'sales' ? (
        <>
          <section style={{ ...s.section, marginBottom: 16 }}>
            <div style={s.sectionHead}>
              <div>
                <h2 style={s.h2}>세금계산서 요약 (수금 기준)</h2>
                <p style={s.hint}>
                  기간 {from || '-'} ~ {to || '-'}
                  {paymentMethod
                    ? ` · ${paymentMethod === 'transfer' ? '무통장' : paymentMethod === 'cash' ? '현금' : '카드'}`
                    : ' · 전체 결제수단'}
                  {pending ? ' · 불러오는 중…' : ''}
                </p>
              </div>
              <button
                type="button"
                style={s.csvBtn}
                disabled={taxRows.length === 0}
                onClick={() => downloadTaxCsv(taxRows, from, to)}
              >
                CSV 내보내기
              </button>
            </div>

            {taxError && (
              <p style={{ color: '#B91C1C', fontSize: 13, margin: '0 0 12px' }}>{taxError}</p>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>거래처명</th>
                    <th style={s.th}>사업자번호</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>과세합계</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>카드(제외)</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>계산서발행</th>
                  </tr>
                </thead>
                <tbody>
                  {taxRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={s.emptyTd}>
                        표시할 데이터가 없습니다
                      </td>
                    </tr>
                  ) : (
                    taxRows.map((r) => (
                      <tr key={r.customer_id}>
                        <td style={s.td}>
                          <Link href={`/customers/${r.customer_id}/ledger`} style={s.rowLink}>
                            {r.name}
                          </Link>
                        </td>
                        <td style={s.td}>{r.biz_number || '—'}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(r.taxable_paid)}</td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{formatKRW(r.card_paid)}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                          {formatKRW(r.invoice_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={s.section}>
            <h2 style={s.h2}>매출원장 — 거래처 선택</h2>
            <p style={s.hint}>거래처를 선택하면 해당 거래처 원장 페이지로 이동합니다.</p>

            <div style={{ position: 'relative' }}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setOpen(true)
                  setActiveIndex(-1)
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder="거래처명 · 대표자명 · 연락처로 검색"
                autoComplete="off"
              />
              {open && filtered.length > 0 && (
                <ul className={styles.dropdown}>
                  {filtered.map((c, idx) => (
                    <li
                      key={c.id}
                      className={[
                        styles.dropdownItem,
                        activeIndex === idx ? styles.dropdownItemActive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={() => {
                        setSearch(c.name)
                        setOpen(false)
                        setActiveIndex(-1)
                        selectCustomer(c.id)
                      }}
                    >
                      <span className={styles.itemName}>{c.name}</span>
                      {c.representative_name && (
                        <span className={styles.itemSub}>{c.representative_name}</span>
                      )}
                      {c.phone && <span className={styles.itemSub}>{c.phone}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {customers.length === 0 && (
              <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>
                등록된 거래처가 없습니다.
              </p>
            )}
          </section>
        </>
      ) : (
        <section style={s.section}>
          <h2 style={s.h2}>매입원장 — 매입처 선택</h2>
          <p style={s.hint}>현재는 진입·필터 단계이며, 상세 표는 SUP-TODO-004-B에서 제공합니다.</p>

          <select
            style={s.select}
            value={supplier}
            onChange={(e) => selectSupplier(e.target.value)}
          >
            <option value="">매입처 선택…</option>
            {supplierOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {supplierOptions.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>매입 데이터가 없습니다.</p>
          )}

          {supplier && (
            <div style={s.summaryBox}>
              <p style={{ fontSize: 13, margin: 0 }}>
                선택: <strong>{supplier}</strong> · 기간 {from || '-'} ~ {to || '-'}
              </p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>
                상세 매입원장(매입·지급 합계, 잔액)은 다음 단계에서 활성화됩니다.
              </p>
              <div style={{ marginTop: 12 }}>
                <Link href="/purchases" style={s.linkBtn}>
                  매입 목록 →
                </Link>
                <Link href="/disbursements" style={{ ...s.linkBtn, marginLeft: 8 }}>
                  지급 목록 →
                </Link>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  tabs: {
    display: 'flex',
    gap: 4,
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 16,
  },
  tab: {
    padding: '8px 14px',
    fontSize: 13,
    color: '#6b7280',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  tabActive: {
    color: '#111827',
    fontWeight: 600,
    borderBottom: '2px solid #111827',
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  lb: { fontSize: 12, color: '#6b7280' },
  input: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
  },
  methodSelect: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 13,
    background: '#fff',
    minWidth: 100,
  },
  select: {
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    background: '#fff',
    minWidth: 240,
  },
  presetBtn: {
    padding: '7px 12px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    color: '#374151',
  },
  searchBtn: {
    padding: '7px 14px',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
  resetBtn: {
    padding: '7px 14px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    color: '#6b7280',
  },
  csvBtn: {
    padding: '7px 14px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    color: '#111827',
    whiteSpace: 'nowrap',
  },
  section: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    background: '#fff',
  },
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  h2: { fontSize: 15, fontWeight: 600, margin: '0 0 8px 0' },
  hint: { fontSize: 12, color: '#9ca3af', margin: '0 0 16px 0' },
  summaryBox: {
    marginTop: 16,
    padding: 16,
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
  },
  linkBtn: { fontSize: 12, color: '#1D4ED8', textDecoration: 'none' },
  rowLink: { color: '#111827', textDecoration: 'none', fontWeight: 500 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 10px',
    borderBottom: '1px solid #f3f4f6',
    color: '#111827',
    verticalAlign: 'middle',
  },
  emptyTd: {
    padding: '24px 10px',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
  },
}
