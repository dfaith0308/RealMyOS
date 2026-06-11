'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LedgerCustomerOption } from '@/actions/ledger'
import styles from './LedgerHubClient.module.css'

type LedgerKind = 'sales' | 'purchases'

interface Props {
  initialKind: LedgerKind
  initialFrom: string
  initialTo:   string
  initialSupplier: string
  customers:   LedgerCustomerOption[]
  suppliers:   string[]
}

export default function LedgerHubClient({
  initialKind, initialFrom, initialTo, initialSupplier,
  customers, suppliers,
}: Props) {
  const router = useRouter()

  const [kind, setKind]         = useState<LedgerKind>(initialKind)
  const [from, setFrom]         = useState(initialFrom)
  const [to, setTo]             = useState(initialTo)
  const [supplier, setSupplier] = useState(initialSupplier)
  const [search, setSearch]     = useState('')
  const [open, setOpen]         = useState(false)

  const supplierOptions = useMemo(() => suppliers.filter((s) => s.trim().length > 0), [suppliers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').replace(/-/g, '').includes(q.replace(/-/g, '')) ||
        (c.representative_name ?? '').toLowerCase().includes(q)
      )
    }).slice(0, 8)
  }, [customers, search])

  function pushQuery(next: { kind?: LedgerKind; supplier?: string }) {
    const params = new URLSearchParams()
    const k = next.kind ?? kind
    if (k && k !== 'sales') params.set('kind', k)
    if (from) params.set('from', from)
    if (to)   params.set('to',   to)
    const sup = next.supplier ?? supplier
    if (k === 'purchases' && sup) params.set('supplier', sup)
    const q = params.toString()
    router.push(q ? `/ledger?${q}` : '/ledger')
  }

  function applyFilters() {
    pushQuery({})
  }

  function selectCustomer(id: string) {
    if (id) router.push(`/customers/${id}/ledger`)
  }

  function selectSupplier(name: string) {
    setSupplier(name)
    pushQuery({ kind: 'purchases', supplier: name })
  }

  return (
    <div>
      <div style={s.tabs}>
        <button type="button"
          style={{ ...s.tab, ...(kind === 'sales' ? s.tabActive : null) }}
          onClick={() => { setKind('sales'); pushQuery({ kind: 'sales' }) }}>
          매출원장
        </button>
        <button type="button"
          style={{ ...s.tab, ...(kind === 'purchases' ? s.tabActive : null) }}
          onClick={() => { setKind('purchases'); pushQuery({ kind: 'purchases' }) }}>
          매입원장
        </button>
      </div>

      <div style={s.filterRow}>
        <label style={s.lb}>기간</label>
        <input type="date" value={from} style={s.input}
          onChange={(e) => setFrom(e.target.value)} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>~</span>
        <input type="date" value={to} style={s.input}
          onChange={(e) => setTo(e.target.value)} />
        <button type="button" style={s.searchBtn} onClick={applyFilters}>적용</button>
        <button type="button" style={s.resetBtn} onClick={() => router.push('/ledger')}>초기화</button>
      </div>

      {kind === 'sales' ? (
        <section style={s.section}>
          <h2 style={s.h2}>매출원장 — 거래처 선택</h2>
          <p style={s.hint}>거래처를 선택하면 해당 거래처 원장 페이지로 이동합니다.</p>

          <div style={{ position: 'relative' }}>
            <input
              className={styles.searchInput}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="거래처명 · 대표자명 · 연락처로 검색"
              autoComplete="off"
            />
            {open && filtered.length > 0 && (
              <ul className={styles.dropdown}>
                {filtered.map((c) => (
                  <li
                    key={c.id}
                    className={styles.dropdownItem}
                    onMouseDown={() => {
                      setSearch(c.name)
                      setOpen(false)
                      selectCustomer(c.id)
                    }}
                  >
                    <span className={styles.itemName}>{c.name}</span>
                    {c.representative_name && (
                      <span className={styles.itemSub}>{c.representative_name}</span>
                    )}
                    {c.phone && (
                      <span className={styles.itemSub}>{c.phone}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {customers.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>등록된 거래처가 없습니다.</p>
          )}
        </section>
      ) : (
        <section style={s.section}>
          <h2 style={s.h2}>매입원장 — 매입처 선택</h2>
          <p style={s.hint}>현재는 진입·필터 단계이며, 상세 표는 SUP-TODO-004-B에서 제공합니다.</p>

          <select style={s.select} value={supplier}
            onChange={(e) => selectSupplier(e.target.value)}>
            <option value="">매입처 선택…</option>
            {supplierOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
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
                <Link href="/purchases" style={s.linkBtn}>매입 목록 →</Link>
                <Link href="/disbursements" style={{ ...s.linkBtn, marginLeft: 8 }}>지급 목록 →</Link>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  tabs:        { display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 },
  tab:         { padding: '8px 14px', fontSize: 13, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive:   { color: '#111827', fontWeight: 600, borderBottom: '2px solid #111827' },
  filterRow:   { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  lb:          { fontSize: 12, color: '#6b7280' },
  input:       { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' },
  select:      { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff', minWidth: 240 },
  searchBtn:   { padding: '7px 14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  resetBtn:    { padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  section:     { border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, background: '#fff' },
  h2:          { fontSize: 15, fontWeight: 600, margin: '0 0 8px 0' },
  hint:        { fontSize: 12, color: '#9ca3af', margin: '0 0 16px 0' },
  summaryBox:  { marginTop: 16, padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 },
  linkBtn:     { fontSize: 12, color: '#1D4ED8', textDecoration: 'none' },
}
