import { getDeliveryMessageDashboard } from '@/actions/admin/delivery-messages'
import s from '../../../admin-shared.module.css'
import DeliveryMessagesClient from './DeliveryMessagesClient'

export const metadata = { title: '배송완료 메시지 — 식식이 관리자' }

export default async function AdminDeliveryMessagesPage() {
  const res = await getDeliveryMessageDashboard()

  return (
    <main className={s.main}>
      <header className={s.headerBetween}>
        <div>
          <h1 className={s.title}>배송완료 메시지</h1>
          <p className={s.subtitleMax720}>
            배송 완료가 기록되면 식당에 도착 안내를 보냅니다. 발신 명의는 「식식이」로 통일하고, 실제 보낸 공급자는 본문의
            「보내는 분」으로 표시합니다. 카카오 알림톡을 먼저 시도하고 실패하면 문자로 보냅니다. 한 주문에 두 번 나가지 않습니다.
            기본값은 「사용 안 함 + 확인 후 발송」입니다.
          </p>
        </div>
      </header>

      {!res.success || !res.data ? (
        <p className={s.errText}>{res.error ?? '불러오지 못했습니다'}</p>
      ) : (
        <DeliveryMessagesClient data={res.data} />
      )}
    </main>
  )
}
