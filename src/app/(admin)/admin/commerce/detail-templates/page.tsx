import Link from 'next/link'
import { getOrderGuideSettings, listDetailTemplates } from '@/actions/admin/detail-templates'
import { DETAIL_FIELDS } from '@/lib/detail-template/fields'
import s from '../../../admin-shared.module.css'
import DetailTemplatesClient from './DetailTemplatesClient'

export const metadata = { title: '상세페이지 템플릿 — 식식이 관리자' }

export default async function AdminDetailTemplatesPage(props: {
  searchParams?: Promise<{ archived?: string }>
}) {
  const sp = (await props.searchParams) ?? {}
  const includeArchived = sp.archived === '1'
  const [res, guide] = await Promise.all([listDetailTemplates({ includeArchived }), getOrderGuideSettings()])

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>상세페이지 템플릿</h1>
          <p className={s.subtitleMax720}>
            같은 품목의 규격(1kg·5kg·박스)을 하나로 묶어 상세페이지 내용을 한 번만 넣습니다. 각 규격(옵션)은
            칸마다 자기 값을 따로 넣을 수 있고, 지우면 다시 공통 값을 씁니다. 가격·단가표·최소주문·배송비는
            상품 등록 값에서 자동으로 채워집니다. 기존 「상세이미지 자동생성」은 그대로 쓸 수 있습니다.
          </p>
        </div>
        <Link href={includeArchived ? '/admin/commerce/detail-templates' : '/admin/commerce/detail-templates?archived=1'} className={s.ghostBtnMd}>
          {includeArchived ? '보관 숨기기' : '보관 포함 보기'}
        </Link>
      </header>

      {!res.success ? (
        <p className={s.errText}>{res.error}</p>
      ) : (
        <DetailTemplatesClient
          templates={res.data?.templates ?? []}
          totalFields={DETAIL_FIELDS.length}
          guide={guide.success ? guide.data ?? null : null}
          guideError={guide.success ? null : guide.error ?? null}
        />
      )}
    </main>
  )
}
