'use server'

import { requireAdmin } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const RESTAURANT_OS_URL = 'https://restaurant.siksiki.com'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!

export async function sendPushToTenant(input: {
  tenant_id: string
  title: string
  body: string
  url?: string
}): Promise<{ success: boolean; sent?: number; error?: string }> {
  await requireAdmin()

  if (!INTERNAL_API_KEY) {
    return { success: false, error: 'INTERNAL_API_KEY가 설정되지 않았습니다' }
  }

  const res = await fetch(`${RESTAURANT_OS_URL}/api/push/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify(input),
  })

  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error }
  return { success: true, sent: data.sent }
}

export async function sendPushToAll(input: {
  title: string
  body: string
  url?: string
}): Promise<{ success: boolean; total?: number; error?: string }> {
  await requireAdmin()

  if (!INTERNAL_API_KEY) {
    return { success: false, error: 'INTERNAL_API_KEY가 설정되지 않았습니다' }
  }

  const supabase = await createSupabaseAdmin()

  const { data: subs, error } = await supabase.from('push_subscriptions').select('tenant_id')

  if (error) return { success: false, error: error.message }

  if (!subs || subs.length === 0) {
    return { success: true, total: 0 }
  }

  const tenantIds = [...new Set(subs.map((s) => s.tenant_id))]

  let total = 0
  for (const tenant_id of tenantIds) {
    const res = await fetch(`${RESTAURANT_OS_URL}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({ tenant_id, ...input }),
    })
    const data = await res.json()
    if (data.success) total += data.sent ?? 0
  }

  return { success: true, total }
}
