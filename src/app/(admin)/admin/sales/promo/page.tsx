import Link from 'next/link'
import { listLeadsForPromo, listPromoCodes } from '@/actions/admin/sales-promo'
import s from '../../../admin-shared.module.css'
import PromoCodesClient from './PromoCodesClient'

export const metadata = { title: '프로모션 코드 — 식식이 관리자' }

export default async function AdminSalesPromoPage() {
  const [codesRes, leadsRes] = await Promise.all([listPromoCodes(), listLeadsForPromo()])

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>프로모션 코드</h1>
          <p className={s.subtitleMax780}>
            구독료 프로모션 코드를 직접 정해 발급하고 사용현황을 확인합니다. 코드를 입력한 고객은
            첫 결제가 면제되고, 무료 개월수만큼 구독이 바로 시작됩니다.
          </p>
        </div>
        <Link href="/admin/sales" className={s.ghostBtnMd}>
          영업/가입관리
        </Link>
      </header>

      {!codesRes.success ? (
        <p className={s.errText}>{codesRes.error ?? '코드를 불러오지 못했습니다.'}</p>
      ) : (
        <PromoCodesClient
          codes={codesRes.data?.codes ?? []}
          usage={codesRes.data?.usage ?? []}
          leads={leadsRes.data?.leads ?? []}
        />
      )}
    </main>
  )
}
