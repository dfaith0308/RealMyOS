import Link from 'next/link'
import { getInquiry } from '@/actions/admin/inquiries'
import s from '../../../admin-shared.module.css'
import InquiryDetailClient from './InquiryDetailClient'

export const metadata = { title: '문의 상세 — 식식이 관리자' }

export default async function AdminInquiryDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const res = await getInquiry(id)

  if (!res.success || !res.data) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>문의 상세</h1>
        <p className={s.errText}>{res.error ?? '문의를 불러오지 못했습니다.'}</p>
        <p>
          <Link href="/admin/inquiries" className={s.ghostBtnMd}>
            목록으로
          </Link>
        </p>
      </main>
    )
  }

  return <InquiryDetailClient inquiry={res.data.inquiry} />
}
