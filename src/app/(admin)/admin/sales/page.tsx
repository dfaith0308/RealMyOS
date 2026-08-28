import Link from 'next/link'
import { getLeadFilterOptions, listSalesLeads } from '@/actions/admin/sales-leads'
import type { LeadType } from '@/types/sales-lead'
import s from '../../admin-shared.module.css'
import c from './sales.module.css'
import SalesLeadsClient from './SalesLeadsClient'

export const metadata = { title: '영업 관리 — 식식이 관리자' }

function one(v: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v
  const trimmed = (raw ?? '').trim()
  return trimmed || undefined
}

export default async function AdminSalesPage(props: {
  searchParams?: Promise<{
    tab?: string | string[]
    status?: string | string[]
    sido?: string | string[]
    sigungu?: string | string[]
    interest?: string | string[]
    tag?: string | string[]
    q?: string | string[]
  }>
}) {
  const sp = (await props.searchParams) ?? {}

  const tab: LeadType = one(sp.tab) === 'restaurant' ? 'restaurant' : 'supplier'
  const interestRaw = Number(one(sp.interest))
  const filters = {
    lead_type: tab,
    status: one(sp.status),
    region_sido: one(sp.sido),
    region_sigungu: one(sp.sigungu),
    interest_level: Number.isFinite(interestRaw) && interestRaw >= 1 && interestRaw <= 3 ? interestRaw : undefined,
    tag: one(sp.tag),
    q: one(sp.q),
  }

  const [listRes, optionsRes] = await Promise.all([
    listSalesLeads(filters),
    getLeadFilterOptions(tab),
  ])

  const tabs: Array<{ value: LeadType; label: string }> = [
    { value: 'supplier', label: '공급자 영업' },
    { value: 'restaurant', label: '식당 영업' },
  ]

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>영업 관리</h1>
          <p className={s.subtitleMax720}>
            공급자·식당 잠재거래처 발굴 활동을 리드 단위로 관리합니다. 리드를 눌러 메모 타임라인을 남기세요.
          </p>
        </div>
        <Link href="/admin/sales/promo" className={s.ghostBtnMd}>
          프로모션 코드
        </Link>
      </header>

      <nav className={c.tabs}>
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/admin/sales?tab=${t.value}`}
            className={`${c.tab} ${tab === t.value ? c.tabActive : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!listRes.success ? (
        <p className={s.errText}>{listRes.error ?? '리드를 불러오지 못했습니다.'}</p>
      ) : (
        <SalesLeadsClient
          leadType={tab}
          leads={listRes.data?.leads ?? []}
          filters={{
            status: filters.status ?? '',
            sido: filters.region_sido ?? '',
            sigungu: filters.region_sigungu ?? '',
            interest: filters.interest_level ? String(filters.interest_level) : '',
            tag: filters.tag ?? '',
            q: filters.q ?? '',
          }}
          options={optionsRes.data ?? { sidos: [], sigungus: [], tags: [] }}
        />
      )}
    </main>
  )
}
