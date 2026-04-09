'use server'

// ============================================================
// RealMyOS - 메시지 템플릿 Server Actions
// src/actions/message-template.ts
// ============================================================

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import type { ActionResult } from '@/types/order'

export type MessageType = 'call_script' | 'sms' | 'kakao'

export interface MessageTemplate {
  id: string
  name: string
  content: string
  message_type: MessageType
  is_active: boolean
  created_at: string
}

// ============================================================
// 템플릿 전체 조회
// ============================================================

export async function getMessageTemplates(): Promise<ActionResult<MessageTemplate[]>> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('message_templates')
    .select('id, name, content, message_type, is_active, created_at')
    .eq('is_active', true)
    .order('message_type')
    .order('created_at')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

// ============================================================
// 템플릿 등록
// ============================================================

export async function createMessageTemplate(input: {
  name: string
  content: string
  message_type: MessageType
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.name.trim()) return { success: false, error: '템플릿 이름을 입력해주세요.' }
  if (!input.content.trim()) return { success: false, error: '내용을 입력해주세요.' }

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      tenant_id:    ctx.tenant_id,
      name:         input.name.trim(),
      content:      input.content.trim(),
      message_type: input.message_type,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message }

  revalidatePath('/settings/messages')
  return { success: true, data: { id: data.id } }
}

// ============================================================
// 템플릿 수정
// ============================================================

export async function updateMessageTemplate(input: {
  id: string
  name: string
  content: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: '로그인 필요' }

  if (!input.name.trim()) return { success: false, error: '이름을 입력해주세요.' }
  if (!input.content.trim()) return { success: false, error: '내용을 입력해주세요.' }

  const { error } = await supabase
    .from('message_templates')
    .update({
      name:       input.name.trim(),
      content:    input.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/messages')
  return { success: true }
}

// ============================================================
// 템플릿 비활성화 (삭제 대신)
// ============================================================

export async function deactivateMessageTemplate(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('message_templates')
    .update({ is_active: false })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/settings/messages')
  return { success: true }
}
