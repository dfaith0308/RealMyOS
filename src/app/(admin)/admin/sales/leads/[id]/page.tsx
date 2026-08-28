import Link from 'next/link'
import { getSalesLead, listTenantsForLink } from '@/actions/admin/sales-leads'
import { getLeadSmsConfigStatus } from '@/actions/admin/sales-lead-sms'
import s from '../../../../admin-shared.module.css'
import LeadDetailClient from './LeadDetailClient'

export const metadata = { title: '리드 상세 — 식식이 관리자' }

export default async function AdminSalesLeadDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const [leadRes, tenantsRes, smsRes] = await Promise.all([
    getSalesLead(id),
    listTenantsForLink(),
    getLeadSmsConfigStatus(),
  ])

  if (!leadRes.success || !leadRes.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>리드 상세</h1>
        <p className={s.errText}>{leadRes.error ?? '리드를 불러오지 못했습니다.'}</p>
        <p>
          <Link href="/admin/sales" className={s.ghostBtnMd}>
            목록으로
          </Link>
        </p>
      </main>
    )
  }

  return (
    <LeadDetailClient
      lead={leadRes.data.lead}
      notes={leadRes.data.notes}
      tenants={tenantsRes.data?.tenants ?? []}
      smsConfigured={smsRes.data?.configured ?? false}
    />
  )
}
