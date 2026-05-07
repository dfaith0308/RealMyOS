'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataCell, DataTableRow } from '@/components/ui/DataTableRow'
import { formatKRW } from '@/lib/calc'
import styles from './CustomerLedgerFlowClient.module.css'

type LedgerRow = {
  id: string
  date: string
  type: 'order' | 'payment'
  order_number?: string
  summary?: string
  total_amount?: number
  payment_amount?: number
  payment_method?: string
  memo?: string
  running_balance: number
}

type Preset = 'month' | '7d' | 'custom'
type Method = '' | 'transfer' | 'cash' | 'card' | 'platform'

function kstTodayStr() {
  const now = new Date(Date.now() + 9 * 3600000)
  return now.toISOString().slice(0, 10)
}

function monthStartStr() {
  const d = new Date(Date.now() + 9 * 3600000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function daysAgoStr(n: number) {
  const d = new Date(Date.now() + 9 * 3600000)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function sumRowAmount(row: LedgerRow) {
  if (row.type === 'order') return row.total_amount ?? 0
  return -(row.payment_amount ?? 0)
}

export function CustomerLedgerFlowClient({
  customerId,
  initialFrom,
  initialTo,
  initialMethod,
  openingBalance,
  rows,
}: {
  customerId: string
  initialFrom: string
  initialTo: string
  initialMethod: Method
  openingBalance: number
  rows: LedgerRow[]
}) {
  const router = useRouter()

  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [method, setMethod] = useState<Method>(initialMethod)

  const preset: Preset = useMemo(() => {
    if (from === monthStartStr() && to === kstTodayStr()) return 'month'
    if (from === daysAgoStr(6) && to === kstTodayStr()) return '7d'
    return 'custom'
  }, [from, to])

  const debounce = useRef<number | null>(null)
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (method) params.set('payment_method', method)
      const q = params.toString()
      router.push(q ? `/customers/${customerId}/ledger?${q}` : `/customers/${customerId}/ledger`)
    }, 350)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [from, to, method, router, customerId])

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { date: string; rows: LedgerRow[]; sales: number; paid: number }
    >()
    for (const r of rows) {
      const g =
        map.get(r.date) ?? { date: r.date, rows: [], sales: 0, paid: 0 }
      g.rows.push(r)
      if (r.type === 'order') g.sales += r.total_amount ?? 0
      else g.paid += r.payment_amount ?? 0
      map.set(r.date, g)
    }
    // rows already sorted ascending by date in action; keep insertion order
    return [...map.values()]
  }, [rows])

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.chipRow} aria-label="기간 프리셋">
          <Chip active={preset === 'month'} onClick={() => {
            setFrom(monthStartStr())
            setTo(kstTodayStr())
          }}>이번달</Chip>
          <Chip active={preset === '7d'} onClick={() => {
            setFrom(daysAgoStr(6))
            setTo(kstTodayStr())
          }}>최근7일</Chip>
          <Chip active={preset === 'custom'} onClick={() => {}}>직접</Chip>
        </div>

        <input
          className={styles.dateInput}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="시작일"
        />
        <span className={styles.sep}>~</span>
        <input
          className={styles.dateInput}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="종료일"
        />

        <div className={styles.chipRow} aria-label="결제수단 필터">
          <Chip active={method === ''} onClick={() => setMethod('')}>전체</Chip>
          <Chip active={method === 'transfer'} onClick={() => setMethod('transfer')}>무통장</Chip>
          <Chip active={method === 'cash'} onClick={() => setMethod('cash')}>현금</Chip>
          <Chip active={method === 'card'} onClick={() => setMethod('card')}>카드</Chip>
        </div>
      </div>

      <div className={styles.flow}>
        <div className={styles.opening}>
          <div className={styles.openingLabel}>기초잔액</div>
          <div className={styles.bal}>{formatKRW(openingBalance)}</div>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>해당 기간 거래 내역이 없습니다</div>
        ) : (
          groups.map((g) => {
            const net = g.paid - g.sales
            return (
              <div key={`g-${g.date}`}>
                <div className={styles.groupHead}>
                  <div className={styles.groupDate}>{g.date}</div>
                  <div className={styles.groupNums}>
                    <span className={styles.gNum}>매출 {formatKRW(g.sales)}</span>
                    <span className={styles.gNum}>수금 {formatKRW(g.paid)}</span>
                    <span className={[styles.gNum, styles.gNumStrong].join(' ')}>
                      순흐름 {net >= 0 ? `+${formatKRW(net)}` : `−${formatKRW(Math.abs(net))}`}
                    </span>
                  </div>
                </div>

                {g.rows.map((r) => {
                  const amt = sumRowAmount(r)
                  const isSale = r.type === 'order'
                  const title = isSale
                    ? r.summary ?? '판매'
                    : '수금'
                  const sub = isSale
                    ? r.order_number ? `#${r.order_number}` : ''
                    : (r.payment_method ?? '').toUpperCase()
                  return (
                    <DataTableRow
                      key={r.id}
                      density="compact"
                    >
                      <DataCell>
                        <div className={styles.rowMain}>
                          <div className={styles.rowTitle}>{title}</div>
                          <div className={styles.rowSub}>
                            {sub}{r.memo ? (sub ? ` · ${r.memo}` : r.memo) : ''}
                          </div>
                        </div>
                      </DataCell>
                      <DataCell align="end">
                        <span
                          className={[
                            styles.amt,
                            isSale ? styles.amtSale : styles.amtPay,
                          ].join(' ')}
                        >
                          {isSale ? `+${formatKRW(Math.abs(amt))}` : `−${formatKRW(Math.abs(amt))}`}
                        </span>
                      </DataCell>
                      <DataCell align="end" tone="secondary">
                        <span className={styles.bal}>{formatKRW(r.running_balance)}</span>
                      </DataCell>
                    </DataTableRow>
                  )
                })}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.chipActive : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

