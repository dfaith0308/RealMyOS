import { requireAdmin } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import PushSendClient from '@/components/admin/PushSendClient'

export default async function PushPage() {
  await requireAdmin()
  const supabase = await createSupabaseAdmin()

  const { count: totalSubs } = await supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })

  const { data: subsByTenant } = await supabase
    .from('push_subscriptions')
    .select('tenant_id, tenants(name)')
    .order('created_at', { ascending: false })
    .limit(20)

  const tenantMap = new Map<string, { name: string; count: number }>()
  for (const sub of subsByTenant ?? []) {
    const tid = sub.tenant_id
    const name = (sub.tenants as { name?: string } | null)?.name ?? tid.slice(0, 8)
    if (!tenantMap.has(tid)) tenantMap.set(tid, { name, count: 0 })
    tenantMap.get(tid)!.count++
  }
  const tenantList = [...tenantMap.entries()].map(([id, v]) => ({ id, ...v }))

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>푸시 알림 발송</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          식당OS 앱에 설치된 사장님들에게 푸시 알림을 보냅니다
        </p>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>구독 현황</p>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div
            style={{
              padding: '16px 20px',
              background: '#f0f7f3',
              borderRadius: 10,
              textAlign: 'center',
              flex: 1,
            }}
          >
            <p style={{ fontSize: 28, fontWeight: 800, color: '#1f5d3a', margin: '0 0 4px' }}>{totalSubs ?? 0}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>전체 구독 기기</p>
          </div>
          <div
            style={{
              padding: '16px 20px',
              background: '#f7f6f2',
              borderRadius: 10,
              textAlign: 'center',
              flex: 1,
            }}
          >
            <p style={{ fontSize: 28, fontWeight: 800, color: '#374151', margin: '0 0 4px' }}>{tenantList.length}</p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>구독 식당 수</p>
          </div>
        </div>

        {tenantList.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>식당명</th>
                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>
                  기기 수
                </th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>
                  테넌트 ID
                </th>
              </tr>
            </thead>
            <tbody>
              {tenantList.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', color: '#1a1a1a', fontWeight: 500 }}>{t.name}</td>
                  <td style={{ padding: '10px 12px', color: '#1f5d3a', fontWeight: 700, textAlign: 'center' }}>
                    {t.count}개
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                  >
                    {t.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, textAlign: 'center', padding: '16px 0' }}>
            아직 구독한 기기가 없습니다
          </p>
        )}
      </div>

      <PushSendClient />
    </main>
  )
}
