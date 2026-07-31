'use server'

import { requireAdmin } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

const RESTAURANT_OS_URL = 'https://restaurant.siksiki.com'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!

export type PushBroadcastTarget = {
  tenant_id: string
  name: string
  devices: number
}

export type PushBroadcastPreview = {
  total_tenants: number
  total_devices: number
  tenants: PushBroadcastTarget[]
}

/** 전체 발송 대상 미리보기 (발송 없음) */
export async function previewPushBroadcast(): Promise<
  { success: true; data: PushBroadcastPreview } | { success: false; error: string }
> {
  await requireAdmin()
  const supabase = await createSupabaseAdmin()

  const { data: subs, error } = await supabase.from('push_subscriptions').select('tenant_id')
  if (error) return { success: false, error: error.message }

  const counts = new Map<string, number>()
  for (const row of subs ?? []) {
    const id = String(row.tenant_id)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const tenantIds = [...counts.keys()]
  if (tenantIds.length === 0) {
    return { success: true, data: { total_tenants: 0, total_devices: 0, tenants: [] } }
  }

  const { data: tenants } = await supabase.from('tenants').select('id, name').in('id', tenantIds)
  const nameMap = new Map((tenants ?? []).map((t) => [t.id as string, String(t.name ?? '')]))

  const list: PushBroadcastTarget[] = tenantIds
    .map((tenant_id) => ({
      tenant_id,
      name: nameMap.get(tenant_id) || tenant_id.slice(0, 8),
      devices: counts.get(tenant_id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return {
    success: true,
    data: {
      total_tenants: list.length,
      total_devices: list.reduce((s, t) => s + t.devices, 0),
      tenants: list,
    },
  }
}

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

  const tenant_id = String(input.tenant_id ?? '').trim()
  if (!tenant_id) return { success: false, error: 'tenant_id가 필요합니다' }

  const res = await fetch(`${RESTAURANT_OS_URL}/api/push/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify({ ...input, tenant_id }),
  })

  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error }

  const supabase = await createSupabaseAdmin()
  await supabase.from('push_logs').insert({
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    target_type: 'single',
    target_tenant_id: tenant_id,
    sent_count: data.sent ?? 0,
  })

  return { success: true, sent: data.sent }
}

/**
 * 전체 발송 — 반드시 confirmed=true 와 확인 문구가 있어야 실행됩니다.
 * UI 확인 모달 없이 직접 호출해도 서버에서 거부합니다.
 */
export async function sendPushToAll(input: {
  title: string
  body: string
  url?: string
  /** 확인 모달에서만 true로 전달 */
  confirmed?: boolean
  /** 사용자가 입력한 확인 문구 — 정확히 "전체 발송 확인" */
  confirm_phrase?: string
}): Promise<{ success: boolean; total?: number; error?: string }> {
  await requireAdmin()

  if (input.confirmed !== true) {
    return {
      success: false,
      error: '전체 발송은 확인 모달에서만 가능합니다 (confirmed 필요)',
    }
  }
  if (String(input.confirm_phrase ?? '').trim() !== '전체 발송 확인') {
    return {
      success: false,
      error: '확인 문구가 일치하지 않습니다. 「전체 발송 확인」을 입력하세요.',
    }
  }

  if (!INTERNAL_API_KEY) {
    return { success: false, error: 'INTERNAL_API_KEY가 설정되지 않았습니다' }
  }

  const preview = await previewPushBroadcast()
  if (!preview.success) return { success: false, error: preview.error }
  if (preview.data.total_devices === 0) {
    return { success: true, total: 0 }
  }

  let total = 0
  for (const t of preview.data.tenants) {
    const res = await fetch(`${RESTAURANT_OS_URL}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        tenant_id: t.tenant_id,
        title: input.title,
        body: input.body,
        url: input.url,
      }),
    })
    const data = await res.json()
    if (data.success) total += data.sent ?? 0
  }

  const supabase = await createSupabaseAdmin()
  await supabase.from('push_logs').insert({
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    target_type: 'all',
    sent_count: total,
  })

  return { success: true, total }
}
