import { getAdminCategories } from '@/actions/admin/commerce'
import CategoriesClient from '@/components/commerce/CategoriesClient'
import s from '../../../admin-shared.module.css'

export default async function AdminCommerceCategoriesPage() {
  const res = await getAdminCategories()

  if (!res.success) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>카테고리 관리</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {res.error}
        </p>
      </main>
    )
  }

  const tree = res.data?.tree ?? []

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>카테고리 관리</h1>
          <p className={s.subtitle}>
            검색·추천·발주 흐름의 기준이 되는 플랫폼 카테고리입니다. 최대 2-depth(대분류 → 소분류)만 허용됩니다.
          </p>
        </div>
      </header>

      <CategoriesClient tree={tree} />
    </main>
  )
}
