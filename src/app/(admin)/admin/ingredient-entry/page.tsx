import { getProxyTargetRestaurants } from '@/actions/admin/ingredient-proxy'
import IngredientProxyClient from '@/components/admin/IngredientProxyClient'
import s from '../../admin-shared.module.css'

export default async function AdminIngredientEntryPage() {
  const res = await getProxyTargetRestaurants()

  if (!res.success) {
    return (
      <main className={s.mainSimple}>
        <h1 className={s.title}>거래처 식자재 대신 등록</h1>
        <p className={s.subtitle} style={{ color: 'var(--ds-text-danger, #b91c1c)' }}>
          {res.error}
        </p>
      </main>
    )
  }

  return (
    <main className={s.main}>
      <IngredientProxyClient tenants={res.data?.tenants ?? []} />
    </main>
  )
}
