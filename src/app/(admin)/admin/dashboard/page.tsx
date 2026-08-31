import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  PackageCheck,
  PiggyBank,
  ScrollText,
  Store,
  Truck,
  TrendingDown,
  Handshake,
  Sparkles,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { getActionQueue, expireStaleItems, resolveActionQueueItem } from '@/actions/admin/action-queue'
import {
  getRestaurantMetrics,
  getSalesMetrics,
  getSupplierMetrics,
} from '@/actions/admin/dashboard-metrics'
import s from '../../admin-blue.module.css'
import MetricCard from './MetricCard'

export const metadata = { title: '홈 — 식식이 관리자' }

export default async function AdminDashboardPage() {
  // 72h 초과 항목 만료 처리 (best-effort; 실패해도 페이지는 보여준다)
  await expireStaleItems().catch(() => {})

  const [q, restaurant, supplier, sales] = await Promise.all([
    getActionQueue(),
    getRestaurantMetrics(),
    getSupplierMetrics(),
    getSalesMetrics(),
  ])

  const queue = q.data ?? []
  const critical = queue.filter((x) => x.priority === 'critical').slice(0, 10)
  const today = queue.filter((x) => x.priority === 'today').slice(0, 10)

  return (
    <main className={s.scope}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>홈</h1>
          <p className={s.subtitle}>
            지금 무엇을 봐야 하는지 한 화면에 모았습니다. 모든 숫자는 저장값이 아니라 요청 시점에
            실시간으로 계산됩니다.
          </p>
        </div>
        <Link href="/admin/logs" className={s.headerLink}>
          <ScrollText size={15} /> 활동 기록 전체 보기
        </Link>
      </header>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <Store size={17} /> 식당 현황
          </h2>
          <span className={s.sectionNote}>
            카드를 누르면 해당 목록으로 이동합니다
          </span>
        </div>
        {!restaurant.success ? (
          <div className={s.errText}>식당 지표를 불러오지 못했습니다 — {restaurant.error}</div>
        ) : (
          <div className={s.cardGrid}>
            <MetricCard
              label="주기 이탈 위험"
              value={restaurant.data.cycleRisk.count}
              basis="거래처 기준 · 구매 3회 이상, 마지막 구매가 평균 주기의 1.5배 초과"
              icon={<TrendingDown size={17} />}
              href="/admin/dashboard/restaurant-cycle-risk"
              alert
            />
            <MetricCard
              label="신규 재구매 대기"
              value={restaurant.data.repurchaseWait.count}
              basis="거래처 기준 · 구매 1~2회, 마지막 구매 후 30~90일"
              icon={<Clock size={17} />}
              href="/admin/dashboard/restaurant-repurchase-wait"
            />
            <MetricCard
              label="미수금 거래처"
              value={restaurant.data.receivable.count}
              basis="거래처 기준 · 기존 원장과 동일한 미수금 계산식"
              icon={<Wallet size={17} />}
              href="/admin/dashboard/restaurant-receivable"
              alert
            />
            <MetricCard
              label="초과입금 거래처"
              value={restaurant.data.prepayment.count}
              basis="거래처 기준 · 잔액이 음수 (다음 주문에 자동 차감)"
              icon={<PiggyBank size={17} />}
              href="/admin/dashboard/restaurant-prepayment"
            />
            <MetricCard
              label="신규가입 후 미주문"
              value={restaurant.data.newSignupNoOrder.count}
              basis="식당 테넌트 기준 · 가입 14일 경과, 주문 이력 0건"
              icon={<UserPlus size={17} />}
              href="/admin/dashboard/restaurant-no-order"
              alert
            />
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <Truck size={17} /> 공급자 현황
          </h2>
        </div>
        {!supplier.success ? (
          <div className={s.errText}>공급자 지표를 불러오지 못했습니다 — {supplier.error}</div>
        ) : (
          <div className={s.cardGrid}>
            <MetricCard
              label="결제완료 후 미처리"
              value={supplier.data.paidUnprocessed.count}
              unit="건"
              basis="결제완료(paid) 상태로 24시간 이상 대기 중인 주문"
              icon={<PackageCheck size={17} />}
              href="/admin/dashboard/supplier-paid-unprocessed"
              alert
            />
            <MetricCard
              label="무료체험 종료 임박"
              value={supplier.data.trialEnding.count}
              basis="공급자 테넌트 · 구독 만료 7일 이내 (프로모션 무료기간 포함)"
              icon={<CalendarClock size={17} />}
              href="/admin/dashboard/supplier-trial-ending"
              alert
            />
            <MetricCard
              label="로그인 없음 (7일+)"
              value={supplier.data.noLogin.count}
              basis="공급자 테넌트 · 인증 기록(last_sign_in_at) 7일 이상 경과"
              icon={<UserMinus size={17} />}
              href="/admin/dashboard/supplier-no-login"
              alert
            />
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <Handshake size={17} /> 오늘의 영업
          </h2>
          <span className={s.sectionNote}>sales_leads 기준</span>
        </div>
        {!sales.success ? (
          <div className={s.errText}>영업 지표를 불러오지 못했습니다 — {sales.error}</div>
        ) : sales.data.notReady ? (
          <div className={s.noticeText}>
            영업 리드 테이블이 아직 생성되지 않았습니다. sales_leads 마이그레이션을 적용하면 이
            영역에 지표가 표시됩니다.
          </div>
        ) : (
          <div className={s.cardGrid}>
            <MetricCard
              label="이번 주 신규 리드"
              value={sales.data.newLeadsThisWeek.count}
              unit="건"
              basis="이번 주 월요일(KST) 이후 등록된 리드"
              icon={<Sparkles size={17} />}
              href="/admin/dashboard/sales-new-leads"
            />
            <MetricCard
              label="미팅예정"
              value={sales.data.meetingScheduled.count}
              unit="건"
              basis="리드 상태가 '미팅예정'인 건"
              icon={<CalendarClock size={17} />}
              href="/admin/dashboard/sales-meeting"
            />
            <MetricCard
              label="무료체험 종료 임박 리드"
              value={sales.data.leadTrialEnding.count}
              unit="건"
              basis="리드에 발급한 코드를 쓴 테넌트의 만료 7일 이내"
              icon={<CalendarClock size={17} />}
              href="/admin/dashboard/sales-trial-ending"
              alert
            />
          </div>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>
            <CalendarClock size={17} /> 실행 큐
          </h2>
          <span className={s.sectionNote}>우선순위별로 오늘 처리해야 할 항목</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <QueuePanel title="Critical — 즉시 개입" items={critical} alert />
          <QueuePanel title="Today — 오늘 처리" items={today} />
        </div>
      </section>
    </main>
  )
}

function QueuePanel({
  title,
  items,
  alert = false,
}: {
  title: string
  items: any[]
  alert?: boolean
}) {
  async function resolve(id: string) {
    'use server'
    await resolveActionQueueItem(id)
  }

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={`${s.panelTitle} ${alert ? s.panelTitleAlert : ''}`}>
          {alert && <AlertTriangle size={15} />}
          {title}
        </h3>
        <Link href="/admin/trades" className={s.ghostBtn}>
          이상거래 확인
        </Link>
      </div>
      {items.length === 0 ? (
        <div className={s.empty}>항목이 없습니다.</div>
      ) : (
        <div>
          {items.map((it) => (
            <div key={it.id} className={s.queueRow}>
              <div className={s.queueBody}>
                <div className={s.queueTitle}>{it.title}</div>
                <div className={s.queueDesc}>{it.description ?? ''}</div>
              </div>
              <div className={s.queueActions}>
                <form action={resolve.bind(null, it.id)}>
                  <button type="submit" className={s.primaryBtn}>
                    처리
                  </button>
                </form>
                <Link href="/admin/trades" className={s.ghostBtn}>
                  상세
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
