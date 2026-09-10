import { listInquiries } from '@/actions/admin/inquiries'
import type { InquiryView } from '@/types/inquiry'
import s from '../../admin-shared.module.css'
import InquiriesClient from './InquiriesClient'

export const metadata = { title: '문의관리 — 식식이 관리자' }

const VIEWS: InquiryView[] = ['all', 'unmatched', 'matched']

function one(v: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v
  const trimmed = (raw ?? '').trim()
  return trimmed || undefined
}

export default async function AdminInquiriesPage(props: {
  searchParams?: Promise<{
    view?: string | string[]
    q?: string | string[]
  }>
}) {
  const sp = (await props.searchParams) ?? {}

  const rawView = one(sp.view)
  const view: InquiryView = VIEWS.includes(rawView as InquiryView)
    ? (rawView as InquiryView)
    : 'all'
  const q = one(sp.q) ?? ''

  const res = await listInquiries({ view, q })

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>문의관리</h1>
          <p className={s.subtitleMax720}>
            고객이 먼저 연락해 온 문의를 기록합니다. 우리가 먼저 찾아가는 잠재고객은
            영업/가입관리에서 따로 봅니다.
          </p>
        </div>
      </header>

      {!res.success ? (
        <p className={s.errText}>{res.error ?? '문의를 불러오지 못했습니다.'}</p>
      ) : (
        <InquiriesClient view={view} inquiries={res.data?.inquiries ?? []} q={q} />
      )}
    </main>
  )
}
