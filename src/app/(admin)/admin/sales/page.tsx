import Link from 'next/link'
import { listFieldObservations } from '@/actions/admin/field-observations'
import { getLeadFilterOptions, listSalesLeads } from '@/actions/admin/sales-leads'
import type { ObservationView } from '@/types/field-observation'
import type { LeadType } from '@/types/sales-lead'
import s from '../../admin-shared.module.css'
import c from './sales.module.css'
import FieldObservationsClient from './FieldObservationsClient'
import SalesLeadsClient from './SalesLeadsClient'

export const metadata = { title: '영업/가입관리 — 식식이 관리자' }

/** 리드 탭 2개 + 관찰기록 탭 */
type SalesTab = LeadType | 'observations'

const OBSERVATION_VIEWS: ObservationView[] = ['unclassified', 'content', 'converted', 'discarded']

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
    view?: string | string[]
  }>
}) {
  const sp = (await props.searchParams) ?? {}

  const rawTab = one(sp.tab)
  const tab: SalesTab =
    rawTab === 'observations' ? 'observations' : rawTab === 'restaurant' ? 'restaurant' : 'supplier'

  const tabs: Array<{ value: SalesTab; label: string }> = [
    { value: 'supplier', label: '공급자 영업' },
    { value: 'restaurant', label: '식당 영업' },
    { value: 'observations', label: '관찰기록' },
  ]

  const header = (
    <>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>영업/가입관리</h1>
          <p className={s.subtitleMax720}>
            {tab === 'observations'
              ? '현장에서 보고 들은 것을 사진·메모로 먼저 남기고, 쓸 만한 것만 영업 리드로 넘깁니다.'
              : '공급자·식당 잠재거래처 발굴 활동을 리드 단위로 관리합니다. 리드를 눌러 메모 타임라인을 남기세요.'}
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
    </>
  )

  // ── 관찰기록 탭 ──
  if (tab === 'observations') {
    const rawView = one(sp.view)
    const view: ObservationView = OBSERVATION_VIEWS.includes(rawView as ObservationView)
      ? (rawView as ObservationView)
      : 'unclassified'
    const q = one(sp.q) ?? ''

    const obsRes = await listFieldObservations({ view, q })

    return (
      <main className={s.main}>
        {header}
        {!obsRes.success ? (
          <p className={s.errText}>{obsRes.error ?? '관찰기록을 불러오지 못했습니다.'}</p>
        ) : (
          <FieldObservationsClient
            view={view}
            observations={obsRes.data?.observations ?? []}
            q={q}
          />
        )}
      </main>
    )
  }

  // ── 리드 탭 ──
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

  return (
    <main className={s.main}>
      {header}

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
