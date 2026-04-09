import { getAccounts } from '@/actions/fund'
import { getFundRules } from '@/actions/fund'
import { getDailyFundPlan, generateDailyFundPlan } from '@/actions/fund'
import { formatKRW } from '@/lib/calc'
import FundsClient from '@/components/fund/FundsClient'

export const metadata = { title: '자금관리 — RealMyOS' }

export default async function FundsPage() {
  // KST 기준 오늘 날짜 (UTC+9 고정 — Vercel 서버는 UTC)
  const now   = new Date()
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [accountsResult, rulesResult, planResult] = await Promise.all([
    getAccounts(),
    getFundRules(),
    getDailyFundPlan(today),
  ])

  // 오늘 날짜 기준 plan 없고 rules + accounts 있으면 자동 생성
  const allPlan  = planResult.data ?? []
  const todayPlan = allPlan.filter((p) => p.date === today)
  let finalPlan   = allPlan

  if (
    todayPlan.length === 0 &&
    (rulesResult.data ?? []).length > 0 &&
    (accountsResult.data ?? []).length > 0
  ) {
    await generateDailyFundPlan(today)
    const refreshed = await getDailyFundPlan(today)
    finalPlan = refreshed.data ?? []
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>자금관리</h1>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0 0' }}>{today} 기준</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/funds/settings" style={s.subBtn}>⚙ 설정</a>
        </div>
      </div>

      <FundsClient
        today={today}
        accounts={accountsResult.data ?? []}
        rules={rulesResult.data ?? []}
        plan={finalPlan}
      />
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  subBtn: { padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', textDecoration: 'none' },
}