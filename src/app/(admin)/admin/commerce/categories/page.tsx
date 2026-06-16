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
      <CategoriesClient tree={tree} />
    </main>
  )
}
