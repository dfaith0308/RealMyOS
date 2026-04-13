import { getSalesTargets, getSalesScripts, getSalesSchedules } from '@/actions/sales'
import SalesScheduleClient from './SalesScheduleClient'

export default async function SalesSchedulePage() {
  const todayStr   = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const twoWeeksLater = new Date(Date.now() + 9 * 3600000 + 14 * 86400000).toISOString().slice(0, 10)
  const [targets, scripts, schedules] = await Promise.all([
    getSalesTargets(),
    getSalesScripts(),
    getSalesSchedules(undefined, twoWeeksLater),  // dateFrom 제거 — 과거 미완료 스케줄 포함
  ])
  return (
    <SalesScheduleClient
      initialTargets={targets.data ?? []}
      initialScripts={scripts.data ?? []}
      initialSchedules={schedules.data ?? []}
    />
  )
}