import { getMessageTemplates } from '@/actions/message-template'
import MessageTemplateManager from '@/components/settings/MessageTemplateManager'

export const metadata = { title: '메시지 템플릿 — RealMyOS' }

const TYPE_LABEL: Record<string, string> = {
  call_script: '전화 스크립트',
  sms:         '문자',
  kakao:       '카카오',
}

export default async function MessagesPage() {
  const result = await getMessageTemplates()
  const templates = result.data ?? []

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>메시지 템플릿</h1>
        <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
          어떤 메시지가 결과를 만드는지 측정합니다. 템플릿 선택은 옵션입니다.
        </p>
      </div>
      <MessageTemplateManager templates={templates} typeLabel={TYPE_LABEL} />
    </main>
  )
}
