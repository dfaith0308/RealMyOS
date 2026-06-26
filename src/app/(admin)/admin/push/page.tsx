import PushSendClient from '@/components/admin/PushSendClient'

export default function PushPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>푸시 알림 발송</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          식당OS 앱에 설치된 사장님들에게 푸시 알림을 보냅니다
        </p>
      </div>
      <PushSendClient />
    </main>
  )
}
