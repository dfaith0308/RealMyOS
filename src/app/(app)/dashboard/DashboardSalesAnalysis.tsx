'use client'

import { useState } from 'react'
import { formatKRW } from '@/lib/calc'
import styles from './dashboard.module.css'

type TabKey = 'month' | 'prevMonth' | 'threeMonths'

type DashboardSalesTopRow = { name: string; amount: number }
type DashboardGrowthRow = { name: string; pct: number }
type DashboardSalesPeriodData = {
  customerTop: DashboardSalesTopRow[]
  productTop: DashboardSalesTopRow[]
  growthTop: DashboardGrowthRow[]
}
type DashboardSalesAnalysisData = Record<TabKey, DashboardSalesPeriodData>

const TABS: { key: TabKey; label: string }[] = [
  { key: 'month', label: '이번달' },
  { key: 'prevMonth', label: '전월' },
  { key: 'threeMonths', label: '3개월' },
]

function maxAmount(rows: DashboardSalesTopRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1
}

function TopList({ title, rows }: { title: string; rows: DashboardSalesTopRow[] }) {
  const max = maxAmount(rows)
  return (
    <div className={styles.analysisCol}>
      <div className={styles.analysisColTitle}>{title}</div>
      {rows.length === 0 ? (
        <div className={styles.analysisEmpty}>데이터 없음</div>
      ) : (
        rows.map((row, i) => {
          const pctBar = Math.round((row.amount / max) * 100)
          return (
            <div key={`${title}-${i}`} className={styles.tr} data-top={i === 0 ? '1' : '0'}>
              <span className={styles.trRank}>{i + 1}</span>
              <span className={styles.trName}>{row.name}</span>
              <span className={styles.trBarWrap}>
                <span className={styles.trBar} style={{ width: `${Math.max(8, pctBar)}%` }} />
              </span>
              <span className={styles.trVal}>{formatKRW(row.amount)}</span>
            </div>
          )
        })
      )}
    </div>
  )
}

function GrowthList({ title, rows }: { title: string; rows: DashboardGrowthRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.pct), 0) || 1
  return (
    <div className={styles.analysisCol}>
      <div className={styles.analysisColTitle}>{title}</div>
      {rows.length === 0 ? (
        <div className={styles.analysisEmpty}>증가 거래처 없음</div>
      ) : (
        rows.map((row, i) => {
          const pctBar = Math.round((row.pct / max) * 100)
          return (
            <div key={`${title}-${i}`} className={styles.tr} data-top={i === 0 ? '1' : '0'}>
              <span className={styles.trRank}>{i + 1}</span>
              <span className={styles.trName}>{row.name}</span>
              <span className={styles.trBarWrap}>
                <span className={styles.trBar} style={{ width: `${Math.max(8, pctBar)}%` }} />
              </span>
              <span className={[styles.trVal, styles.trPct, i === 0 ? styles.trPctTop : ''].join(' ')}>
                +{row.pct}%
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

export function DashboardSalesAnalysis({ data }: { data: DashboardSalesAnalysisData }) {
  const [tab, setTab] = useState<TabKey>('month')
  const period = data[tab]

  return (
    <div className={styles.analysisPanel}>
      <div className={styles.analysisHead}>
        <h2 className={styles.analysisHeading}>매출 분석</h2>
        <div className={styles.tabRow}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={[styles.tabBtn, tab === t.key ? styles.tabBtnActive : ''].join(' ')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.analysisGrid}>
        <TopList title="거래처 매출 TOP 5" rows={period.customerTop} />
        <TopList title="상품 매출 TOP 5" rows={period.productTop} />
        <GrowthList title="매출 증가 TOP 5" rows={period.growthTop} />
      </div>
    </div>
  )
}
