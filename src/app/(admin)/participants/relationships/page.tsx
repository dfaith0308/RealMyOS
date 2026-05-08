import { getRelationships } from '@/actions/admin/trust-engine'
import RelationshipsClient from './relationships-client'
import s from '../../admin-shared.module.css'

export default async function AdminRelationshipsPage() {
  const res = await getRelationships()
  return (
    <main className={s.mainSimple}>
      <RelationshipsClient initial={res.success ? (res.data ?? []) : []} initialError={res.success ? null : (res.error ?? '조회 실패')} />
    </main>
  )
}
