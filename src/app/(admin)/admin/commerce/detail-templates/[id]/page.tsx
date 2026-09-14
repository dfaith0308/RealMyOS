import Link from 'next/link'
import { getDetailTemplate } from '@/actions/admin/detail-templates'
import s from '../../../../admin-shared.module.css'
import DetailTemplateEditorClient from './DetailTemplateEditorClient'

export const metadata = { title: '상세페이지 템플릿 편집 — 식식이 관리자' }

export default async function AdminDetailTemplateEditPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const res = await getDetailTemplate(id)

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>{res.success && res.data ? res.data.title : '상세페이지 템플릿'}</h1>
          <p className={s.subtitleMax720}>
            공통 값(상품)을 채우면 연결된 모든 규격(옵션)이 씁니다. 옵션 칸에 따로 넣으면 그 옵션만 자기 값을 쓰고,
            비우면 공통 값으로 돌아갑니다. 안 채운 칸은 식당 화면에서 제목까지 통째로 숨겨집니다.
          </p>
        </div>
        <Link href="/admin/commerce/detail-templates" className={s.ghostBtnMd}>
          목록
        </Link>
      </header>

      {!res.success || !res.data ? (
        <p className={s.errText}>{res.error ?? '불러오지 못했습니다'}</p>
      ) : (
        <DetailTemplateEditorClient detail={res.data} />
      )}
    </main>
  )
}
