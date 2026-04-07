'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export interface AcquisitionChannel {
  id: string
  name: string
  code: string
  is_active: boolean
}

export async function getAcquisitionChannels(): Promise<ActionResult<AcquisitionChannel[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('acquisition_channels')
    .select('id, name, code, is_active')
    .eq('is_active', true)
    .order('created_at')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function addAcquisitionChannel(name: string): Promise<ActionResult<AcquisitionChannel>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data: me } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!me?.tenant_id) return { success: false, error: '테넌트 없음' }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: '채널명을 입력해주세요.' }

  // code = slug 자동 생성
  const code = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/^_|_$/g, '') + '_' + Date.now().toString(36)

  const { data, error } = await supabase
    .from('acquisition_channels')
    .insert({ tenant_id: me.tenant_id, name: trimmed, code, created_by: user.id })
    .select('id, name, code, is_active')
    .single()

  if (error || !data) return { success: false, error: error?.message }
  revalidatePath('/customers/new')
  return { success: true, data }
}

export async function deactivateAcquisitionChannel(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('acquisition_channels')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/customers/new')
  return { success: true }
}
