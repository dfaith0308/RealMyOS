import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  getRestaurantMetrics,
  getSalesMetrics,
  getSupplierMetrics,
  type MetricBlock,
} from '@/actions/admin/dashboard-metrics'
import s from '../../../admin-blue.module.css'

/**
 * 대시보드 카드 → 상세 목록.
 * 카드에 쓰인 것과 같은 계산 함수를 그대로 호출한다 — 카드 숫자와 목록 건수가
 * 어긋날 수 없다.
 */

type MetricDef = {
  title: string
  basis: string
  columnLabel: string
  load: () => Promise<{ block: MetricBlock; error?: string }>
}

async function restaurantBlock(
  pick: (m: Awaited<ReturnType<typeof getRestaurantMetrics>>) => MetricBlock | null,
): Promise<{ block: MetricBlock; error?: string }> {
  const res = await getRestaurantMetrics()
  const empty: MetricBlock = { count: 0, rows: [] }
  if (!res.success) return { block: empty, error: res.error }
  return { block: pick(res) ?? empty }
}

async function supplierBlock(
  pick: (m: Awaited<ReturnType<typeof getSupplierMetrics>>) => MetricBlock | null,
): Promise<{ block: MetricBlock; error?: string }> {
  const res = await getSupplierMetrics()
  const empty: MetricBlock = { count: 0, rows: [] }
  if (!res.success) return { block: empty, error: res.error }
  return { block: pick(res) ?? empty }
}

async function salesBlock(
  pick: (m: Awaited<ReturnType<typeof getSalesMetrics>>) => MetricBlock | null,
): Promise<{ block: MetricBlock; error?: string }> {
  const res = await getSalesMetrics()
  const empty: MetricBlock = { count: 0, rows: [] }
  if (!res.success) return { block: empty, error: res.error }
  if (res.data.notReady) {
    return { block: empty, error: '영업 리드 테이블이 아직 생성되지 않았습니다 (마이그레이션 미적용)' }
  }
  return { block: pick(res) ?? empty }
}

const METRICS: Record<string, MetricDef> = {
  'restaurant-cycle-risk': {
    title: '주기 이탈 위험 식당',
    basis:
      '공급자 거래처(customers) 기준 · 구매 이력 3회 이상 · 마지막 구매일이 평균 재구매 주기의 1.5배를 초과한 곳',
    columnLabel: '경과',
    load: () => restaurantBlock((r) => (r.success ? r.data.cycleRisk : null)),
  },
  'restaurant-repurchase-wait': {
    title: '신규 재구매 대기 식당',
    basis: '공급자 거래처(customers) 기준 · 구매 이력 1~2회 · 마지막 구매 후 30일 경과, 추가 구매 없음',
    columnLabel: '경과',
    load: () => restaurantBlock((r) => (r.success ? r.data.repurchaseWait : null)),
  },
  'restaurant-receivable': {
    title: '미수금 거래처',
    basis: '공급자 거래처(customers) 기준 · 기존 원장과 동일한 getAccountsReceivable 계산식 (잔액 > 0)',
    columnLabel: '미수금',
    load: () => restaurantBlock((r) => (r.success ? r.data.receivable : null)),
  },
  'restaurant-prepayment': {
    title: '초과입금 거래처',
    basis: '공급자 거래처(customers) 기준 · 동일 계산식에서 잔액이 음수인 곳 (다음 주문에 자동 차감)',
    columnLabel: '초과입금',
    load: () => restaurantBlock((r) => (r.success ? r.data.prepayment : null)),
  },
  'restaurant-no-order': {
    title: '신규가입 후 미주문 식당',
    basis: "식당 테넌트(tenants role='restaurant') 기준 · 가입 14일 경과 · commerce_orders 주문 이력 0건",
    columnLabel: '경과',
    load: () => restaurantBlock((r) => (r.success ? r.data.newSignupNoOrder : null)),
  },
  'supplier-paid-unprocessed': {
    title: '결제완료 후 미처리 주문',
    basis: "commerce_orders 기준 · status='paid' 상태로 24시간 이상 머물러 있는 주문",
    columnLabel: '대기 시간',
    load: () => supplierBlock((r) => (r.success ? r.data.paidUnprocessed : null)),
  },
  'supplier-trial-ending': {
    title: '무료체험 종료 임박',
    basis:
      "공급자 테넌트(tenants role='supplier') 기준 · plan_expires_at 이 지금부터 7일 이내 (프로모션 무료기간 포함)",
    columnLabel: '남은 기간',
    load: () => supplierBlock((r) => (r.success ? r.data.trialEnding : null)),
  },
  'supplier-no-login': {
    title: '로그인 없음 (7일 이상)',
    basis:
      '공급자 테넌트 기준 · Supabase 인증(auth.users)의 last_sign_in_at 이 7일 이상 지났거나 로그인 기록이 없는 곳',
    columnLabel: '경과',
    load: () => supplierBlock((r) => (r.success ? r.data.noLogin : null)),
  },
  'sales-new-leads': {
    title: '이번 주 신규 리드',
    basis: 'sales_leads 기준 · 이번 주 월요일(KST) 이후 등록된 리드',
    columnLabel: '등록',
    load: () => salesBlock((r) => (r.success ? r.data.newLeadsThisWeek : null)),
  },
  'sales-meeting': {
    title: '미팅예정 리드',
    basis: "sales_leads 기준 · status='meeting'(미팅예정)",
    columnLabel: '등록일',
    load: () => salesBlock((r) => (r.success ? r.data.meetingScheduled : null)),
  },
  'sales-trial-ending': {
    title: '무료체험 종료 임박 리드',
    basis:
      '리드에 발급한 프로모션 코드(coupons.lead_id)를 실제 사용한 테넌트 중 plan_expires_at 이 7일 이내인 리드',
    columnLabel: '남은 기간',
    load: () => salesBlock((r) => (r.success ? r.data.leadTrialEnding : null)),
  },
}

export async function generateMetadata(props: { params: Promise<{ metric: string }> }) {
  const { metric } = await props.params
  return { title: `${METRICS[metric]?.title ?? '상세'} — 식식이 관리자` }
}

export default async function DashboardMetricDetailPage(props: {
  params: Promise<{ metric: string }>
}) {
  const { metric } = await props.params
  const def = METRICS[metric]
  if (!def) notFound()

  const { block, error } = await def.load()

  return (
    <main className={s.scope}>
      <header className={s.header}>
        <div>
          <Link href="/admin/dashboard" className={s.backLink}>
            <ArrowLeft size={14} /> 대시보드
          </Link>
          <h1 className={s.title} style={{ marginTop: 8 }}>
            {def.title} <span style={{ color: 'var(--blue-primary)' }}>{block.count}</span>
          </h1>
        </div>
      </header>

      <div className={s.noticeText}>기준 — {def.basis}</div>

      {error && <div className={s.errText}>{error}</div>}

      <section className={s.panel}>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>이름</th>
                <th className={s.th}>기준 정보</th>
                <th className={s.th}>{def.columnLabel}</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.length === 0 ? (
                <tr>
                  <td className={s.td} colSpan={3}>
                    <div className={s.empty}>해당하는 대상이 없습니다.</div>
                  </td>
                </tr>
              ) : (
                block.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={s.tdStrong}>{r.name}</td>
                    <td className={s.tdMuted}>{r.meta}</td>
                    <td className={s.td}>
                      <span className={r.alert ? s.valueDanger : undefined}>{r.value}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
