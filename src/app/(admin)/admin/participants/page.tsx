import { getParticipants } from '@/actions/admin/trust-engine'
import ParticipantsClient from './participants-client'
import s from '../../admin-shared.module.css'

export default async function AdminParticipantsPage() {
  const res = await getParticipants()
  return (
    <main className={s.mainSimple}>
      <ParticipantsClient initial={res.success ? (res.data ?? []) : []} initialError={res.success ? null : (res.error ?? '조회 실패')} />
    </main>
  )
}

