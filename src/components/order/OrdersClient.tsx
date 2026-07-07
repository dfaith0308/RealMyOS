'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatKRW } from '@/lib/calc'
import type { OrderListItem } from '@/actions/order-query'
import styles from '@/app/(app)/orders/orders-ops.module.css'
import type { OrderOperationStatus } from '@/types/order'
import SearchableCustomerSelect, { type SearchableCustomer } from '@/components/order/SearchableCustomerSelect'

interface Filters { from: string; to: string; status: string; order_status: OrderOperationStatus | ''; customer_id: string; view?: string }
type Customer = SearchableCustomer

interface Props {
  orders: OrderListItem[]
  customers: Customer[]
  filters: Filters
}

type Preset = 'month' | '7d' | 'custom'
type View =
  | 'all'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'today_delivery'
  | 'arrears'
  | 'today_new'

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

export default function OrdersClient({ orders, customers, filters }: Props) {
  const router   = useRouter()

  const [from, setFrom] = useState(filters.from)
  const [to, setTo] = useState(filters.to)
  const [customerId, setCustomerId] = useState(filters.customer_id)
  const [view, setView] = useState<View>(() => {
    const v = String(filters.view ?? '')
    if (
      v === 'all' ||
      v === 'in_progress' ||
      v === 'done' ||
      v === 'cancelled' ||
      v === 'today_delivery' ||
      v === 'arrears' ||
      v === 'today_new'
    ) return v
    return 'all'
  })

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
      if (customerId) params.set('customer_id', customerId)
      if (view && view !== 'all') params.set('view', view)
      const q = params.toString()
      router.push(q ? `/orders?${q}` : '/orders')
    }, 250)
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current)
    }
  }, [from, to, customerId, view, router])

  const todayStr = useMemo(() => kstTodayStr(), [])

  const baseOrders = useMemo(() => orders, [orders])

  const viewFiltered = useMemo(() => {
    if (view === 'today_delivery') {
      return baseOrders.filter(
        (o) =>
          o.order_date === todayStr &&
          o.status !== 'cancelled' &&
          (o.order_status === '출고완료' || o.order_status === '납품완료'),
      )
    }
    if (view === 'today_new') {
      return baseOrders.filter((o) => o.order_date === todayStr && o.status === 'draft')
    }
    if (view === 'arrears') {
      return baseOrders.filter((o) => (o.current_balance ?? 0) > 0)
    }
    if (view === 'done') {
      return baseOrders.filter((o) => o.order_status === '납품완료')
    }
    if (view === 'cancelled') {
      return baseOrders.filter((o) => o.status === 'cancelled' || o.order_status === '취소')
    }
    if (view === 'in_progress') {
      return baseOrders.filter((o) => o.status !== 'cancelled' && o.order_status !== '납품완료' && o.order_status !== '취소')
    }
    return baseOrders
  }, [baseOrders, todayStr, view])

  const todaySummary = useMemo(() => {
    const todayOrders = orders.filter((o) => o.order_date === todayStr && o.status !== 'cancelled')
    const todayDelivery = todayOrders.filter((o) => o.order_status === '출고완료' || o.order_status === '납품완료').length
    const arrearsCustomers = new Set(
      orders
        .filter((o) => (o.current_balance ?? 0) > 0)
        .map((o) => o.customer_id),
    )
    const todayNew = todayOrders.filter((o) => o.status === 'draft').length
    return { todayDelivery, arrearsCustomers: arrearsCustomers.size, todayNew }
  }, [orders, todayStr])

  function summarizeLines(lines: OrderListItem['order_lines']): string {
    if (!lines.length) return '-'
    if (lines.length === 1) return `${lines[0].product_name} ${lines[0].quantity}개`
    return `${lines[0].product_name} 외 ${lines.length - 1}건`
  }

  function calcOrderProfit(lines: OrderListItem['order_lines']): number {
    return lines.reduce((s, l) => {
      const cost = (l.cost_price ?? 0) * l.quantity
      const revenue = l.unit_price * l.quantity
      return s + (revenue - cost)
    }, 0)
  }

  function calcGroupMargin(orders: OrderListItem[]): {
    profit: number
    revenue: number
    marginRate: number | null
    hasEnoughCost: boolean
  } {
    let profit = 0
    let revenue = 0
    let linesWithCost = 0
    let totalLines = 0

    for (const o of orders) {
      for (const l of o.order_lines) {
        totalLines++
        const rev = (l.unit_price ?? 0) * (l.quantity ?? 1)
        const cost = (l.cost_price ?? 0) * (l.quantity ?? 1)
        revenue += rev
        if (l.cost_price != null && l.cost_price > 0) {
          profit += rev - cost
          linesWithCost++
        }
      }
    }

    const hasEnoughCost = totalLines > 0 && linesWithCost / totalLines >= 0.5
    const marginRate = hasEnoughCost && revenue > 0
      ? Math.round((profit / revenue) * 100 * 10) / 10
      : null

    return { profit, revenue, marginRate, hasEnoughCost }
  }

  const groupedByDate = useMemo(() => {
    const map = new Map<string, { date: string; rows: OrderListItem[]; cnt: number }>()
    for (const o of viewFiltered) {
      const g = map.get(o.order_date) ?? { date: o.order_date, rows: [], cnt: 0 }
      g.rows.push(o)
      g.cnt += 1
      map.set(o.order_date, g)
    }
    return [...map.values()]
  }, [viewFiltered])

  function statusBadge(o: OrderListItem): { label: string; bg: string; fg: string } | null {
    if (o.status === 'cancelled') return { label: '취소', bg: 'var(--bg-danger)', fg: 'var(--text-danger)' }
    if (o.status === 'confirmed') return { label: '확정', bg: 'var(--bg-success)', fg: 'var(--text-success)' }
    if (o.status === 'draft') return { label: '진행', bg: 'var(--bg-accent)', fg: 'var(--text-accent)' }
    return null
  }

  return (
    <>
      {/* 상단 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>주문 목록</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/orders/new" style={ui.primaryBtn}>주문 등록</Link>
          <Link href="/orders?status=draft" style={ui.secondaryBtn}>Draft 보기</Link>
        </div>
      </div>

      {/* 오늘 할 일 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setView('today_delivery'); setFrom(todayStr); setTo(todayStr) }}
          style={{ ...ui.todoCard, borderColor: view === 'today_delivery' ? 'var(--border-strong)' : 'var(--border)' }}
        >
          <p style={ui.todoLabel}>오늘 배송</p>
          <p style={ui.todoValue}>{todaySummary.todayDelivery}건</p>
        </button>
        <button
          type="button"
          onClick={() => setView('arrears')}
          style={{ ...ui.todoCard, borderColor: view === 'arrears' ? 'var(--border-strong)' : 'var(--border)' }}
        >
          <p style={ui.todoLabel}>미수금 거래처</p>
          <p style={{ ...ui.todoValue, color: 'var(--text-danger)' }}>{todaySummary.arrearsCustomers}건</p>
        </button>
        <button
          type="button"
          onClick={() => { setView('today_new'); setFrom(todayStr); setTo(todayStr) }}
          style={{ ...ui.todoCard, borderColor: view === 'today_new' ? 'var(--border-strong)' : 'var(--border)' }}
        >
          <p style={ui.todoLabel}>오늘 신규 주문</p>
          <p style={{ ...ui.todoValue, color: 'var(--text-success)' }}>{todaySummary.todayNew}건</p>
        </button>
      </div>

      {/* 필터 1줄 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => { setFrom(monthStartStr()); setTo(kstTodayStr()); setView('all') }} style={preset === 'month' ? ui.tabActive : ui.tab}>
            이번달
          </button>
          <button type="button" onClick={() => { setFrom(daysAgoStr(6)); setTo(kstTodayStr()); setView('all') }} style={preset === '7d' ? ui.tabActive : ui.tab}>
            최근7일
          </button>
          <button type="button" onClick={() => {} } style={preset === 'custom' ? ui.tabActive : ui.tab}>
            직접입력
          </button>
        </div>

        {preset === 'custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={ui.dateInput} aria-label="시작일" />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-hint)' }}>~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={ui.dateInput} aria-label="종료일" />
          </>
        )}

        <select value={view} onChange={(e) => setView(e.target.value as View)} style={ui.select} aria-label="상태">
          <option value="all">전체</option>
          <option value="in_progress">진행</option>
          <option value="done">완료</option>
          <option value="cancelled">취소</option>
        </select>

        <div style={{ width: 260 }}>
          <SearchableCustomerSelect
            customers={customers}
            value={customerId}
            onChange={(id) => setCustomerId(id)}
          />
        </div>
      </div>

      {/* 목록 */}
      <div className={styles.queue}>
        {viewFiltered.length === 0 ? (
          <div className={styles.empty}>조건에 해당하는 주문이 없습니다</div>
        ) : (
          <div style={ui.listWrap}>
            {groupedByDate.map((g, gi) => {
              const { profit, revenue, marginRate, hasEnoughCost } = calcGroupMargin(g.rows)
              return (
              <div key={`g-${g.date}`} style={{ borderTop: gi === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={ui.groupHead}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={ui.groupDate}>{g.date}</span>
                    <span style={ui.groupMeta}>{g.cnt}건</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>
                      합계 {revenue.toLocaleString()}원
                    </span>
                    {hasEnoughCost && profit > 0 && (
                      <>
                        <span style={{ fontSize: 12, color: '#1f5d3a' }}>
                          예상 수익 약 {profit.toLocaleString()}원
                        </span>
                        {marginRate !== null && (
                          <span style={{
                            fontSize: 11,
                            background: marginRate >= 20 ? '#f0f7f3' : marginRate >= 10 ? '#fffbeb' : '#fef2f2',
                            color: marginRate >= 20 ? '#1f5d3a' : marginRate >= 10 ? '#d97706' : '#dc2626',
                            padding: '2px 8px',
                            borderRadius: 20,
                            fontWeight: 500,
                          }}>
                            {marginRate}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div style={ui.colHead}>
                  <span style={ui.colLabel}>거래처 · 상품</span>
                  <span style={{ ...ui.colLabel, textAlign: 'right' }}>금액</span>
                  <span style={{ ...ui.colLabel, textAlign: 'right' }}>미수금</span>
                  <span />
                </div>

                {g.rows.map((o) => {
                  const bal = o.current_balance ?? 0
                  const dep = o.deposit_amount ?? 0
                  const hasDep = dep >= 100
                  const st = statusBadge(o)
                  return (
                    <div key={o.id} style={ui.row}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, minWidth: 0 }}>
                          <span style={ui.rowTitle} title={o.customer_name}>{o.customer_name}</span>
                          {st ? <span style={{ ...ui.badge, background: st.bg, color: st.fg }}>{st.label}</span> : null}
                          {hasDep ? <span style={{ ...ui.badge, background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>예치 {formatKRW(dep)}</span> : null}
                        </div>
                        <span style={ui.rowSub} title={summarizeLines(o.order_lines)}>{summarizeLines(o.order_lines)}</span>
                      </div>

                      <span style={ui.money}>{formatKRW(o.total_amount)}</span>
                      <span style={{ ...ui.balance, color: bal > 0 ? 'var(--text-danger)' : 'var(--text-hint)' }}>
                        {formatKRW(bal)}
                      </span>

                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Link
                          href={`/orders/${o.id}/edit`}
                          style={{ fontSize: 12, color: '#1f5d3a', background: '#f0f7f3', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          수정
                        </Link>
                        <Link
                          href={`/orders/${o.id}`}
                          style={{ fontSize: 12, color: '#6b7280', background: '#f7f6f2', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                        >
                          열기
                        </Link>
                        <button
                          type="button"
                          onClick={() => router.push(`/orders/new?reorder=${encodeURIComponent(o.id)}`)}
                          style={ui.reorderBtn}
                        >
                          재주문
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

const ui: Record<string, React.CSSProperties> = {
  primaryBtn: { padding: '10px 16px', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' },
  secondaryBtn: { padding: '10px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' },
  todoCard: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', textAlign: 'left' },
  todoLabel: { fontSize: 12, color: 'var(--text-hint)', margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  todoValue: { fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap' },
  tab: { height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  tabActive: { height: 34, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-strong)', background: 'var(--surface-0)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  select: { height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, minWidth: 160 },
  dateInput: { height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600 },
  listWrap: { background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' },
  groupHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' },
  groupDate: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' },
  groupMeta: { fontSize: 12, color: 'var(--text-hint)', whiteSpace: 'nowrap' },
  groupSum: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' },
  colHead: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 170px', padding: '8px 20px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border)', gap: 12, alignItems: 'center' },
  colLabel: { fontSize: 11, color: 'var(--text-hint)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  row: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 170px', padding: '14px 20px', borderBottom: '0.5px solid var(--border)', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { fontSize: 12, color: 'var(--text-hint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' },
  badge: { fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' },
  money: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right', whiteSpace: 'nowrap' },
  balance: { fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' },
  openBtn: { fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  reorderBtn: { fontSize: 12, color: 'var(--text-success)', background: 'var(--bg-success)', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
}
