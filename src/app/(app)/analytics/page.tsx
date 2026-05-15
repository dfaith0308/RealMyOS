import {
  getAnalyticsOverview,
  getMarginByProduct,
  getMarginByCustomer,
  getRiskSignals,
} from '@/actions/analytics'
import AnalyticsShell from '@/components/analytics/AnalyticsShell'
import OverviewTab from '@/components/analytics/OverviewTab'
import MarginTab from '@/components/analytics/MarginTab'
import CustomerTab from '@/components/analytics/CustomerTab'
import RiskTab from '@/components/analytics/RiskTab'

export const metadata = { title: '매출분석 — RealMyOS' }

type Tab  = 'overview' | 'margin' | 'customer' | 'risk'
type Sort = 'margin' | 'contribution' | 'qty' | 'sales' | 'growth' | 'rate'

const VALID_TABS:  Tab[]  = ['overview', 'margin', 'customer', 'risk']
const VALID_SORTS: Sort[] = ['margin', 'contribution', 'qty', 'sales', 'growth', 'rate']

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
}
function monthStartKST(): string {
  const d = new Date(Date.now() + 9 * 3600000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function resolvePreset(preset?: string): { from: string; to: string } | null {
  const today = todayKST()
  const d = new Date(today + 'T00:00:00Z')
  switch (preset) {
    case 'this_month':
      return { from: monthStartKST(), to: today }
    case 'last_month': {
      const ly = d.getUTCFullYear()
      const lm = d.getUTCMonth()
      const fromD = new Date(Date.UTC(ly, lm - 1, 1))
      const toD   = new Date(Date.UTC(ly, lm, 0))
      return {
        from: fromD.toISOString().slice(0, 10),
        to:   toD.toISOString().slice(0, 10),
      }
    }
    case '3m': {
      const fromD = new Date(d.getTime())
      fromD.setUTCMonth(fromD.getUTCMonth() - 3)
      return { from: fromD.toISOString().slice(0, 10), to: today }
    }
    case '1y': {
      const fromD = new Date(d.getTime())
      fromD.setUTCFullYear(fromD.getUTCFullYear() - 1)
      return { from: fromD.toISOString().slice(0, 10), to: today }
    }
    default:
      return null
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { tab?: string; from?: string; to?: string; preset?: string; sort?: string }
}) {
  const tab: Tab = VALID_TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : 'overview'

  const presetRange = resolvePreset(searchParams.preset)
  const from = presetRange?.from ?? searchParams.from ?? monthStartKST()
  const to   = presetRange?.to   ?? searchParams.to   ?? todayKST()

  const sort: Sort = VALID_SORTS.includes(searchParams.sort as Sort)
    ? (searchParams.sort as Sort)
    : (tab === 'customer' ? 'sales' : 'margin')

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 60px' }}>
      <AnalyticsShell tab={tab} from={from} to={to} preset={searchParams.preset} sort={sort}>
        {tab === 'overview' && <OverviewTabRSC from={from} to={to} />}
        {tab === 'margin'   && <MarginTabRSC   from={from} to={to} sort={sort} />}
        {tab === 'customer' && <CustomerTabRSC from={from} to={to} sort={sort} />}
        {tab === 'risk'     && <RiskTabRSC     from={from} to={to} />}
      </AnalyticsShell>
    </main>
  )
}

async function OverviewTabRSC({ from, to }: { from: string; to: string }) {
  const r = await getAnalyticsOverview(from, to)
  if (!r.success || !r.data) return <ErrBox msg={r.success ? '데이터 없음' : r.error} />
  return <OverviewTab data={r.data} />
}
async function MarginTabRSC({ from, to, sort }: { from: string; to: string; sort: string }) {
  const r = await getMarginByProduct(from, to)
  if (!r.success || !r.data) return <ErrBox msg={r.success ? '데이터 없음' : r.error} />
  return <MarginTab data={r.data} sort={sort} from={from} to={to} />
}
async function CustomerTabRSC({ from, to, sort }: { from: string; to: string; sort: string }) {
  const r = await getMarginByCustomer(from, to)
  if (!r.success || !r.data) return <ErrBox msg={r.success ? '데이터 없음' : r.error} />
  return <CustomerTab data={r.data} sort={sort} from={from} to={to} />
}
async function RiskTabRSC({ from, to }: { from: string; to: string }) {
  const r = await getRiskSignals(from, to)
  if (!r.success || !r.data) return <ErrBox msg={r.success ? '데이터 없음' : r.error} />
  return <RiskTab data={r.data} />
}

function ErrBox({ msg }: { msg?: string }) {
  return (
    <div style={{
      padding: '40px 16px', textAlign: 'center',
      color: '#9ca3af', fontSize: 13,
      border: '1px dashed #e5e7eb', borderRadius: 10, marginTop: 16,
    }}>
      {msg ?? '해당 기간 매출 데이터가 없습니다'}
    </div>
  )
}
