import { getRelationships } from '@/actions/admin/trust-engine'
import RelationshipsClient from './relationships-client'

export default async function AdminRelationshipsPage() {
  const res = await getRelationships()
  return (
    <main style={{ padding: 24 }}>
      <RelationshipsClient initial={res.success ? (res.data ?? []) : []} initialError={res.success ? null : (res.error ?? '조회 실패')} />
    </main>
  )
}

