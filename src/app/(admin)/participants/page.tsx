import { getParticipants } from '@/actions/admin/trust-engine'
import ParticipantsClient from './participants-client'

export default async function AdminParticipantsPage() {
  const res = await getParticipants()
  return (
    <main style={{ padding: 24 }}>
      <ParticipantsClient initial={res.success ? (res.data ?? []) : []} initialError={res.success ? null : (res.error ?? '조회 실패')} />
    </main>
  )
}

