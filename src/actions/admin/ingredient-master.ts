'use server'

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth'

type MasterRow = {
  id: string
  name: string
  barcode: string | null
  item_report_number: string | null
  spec: string | null
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/kg|g|ml|l|개|박스|box|ea|묶음|세트/gi, '')
    .replace(/\d+/g, '')
    .trim()
}

function calcMatchConfidence(
  candidate: { barcode?: string | null; item_report_number?: string | null; name: string; spec?: string | null },
  input: { barcode?: string | null; item_report_number?: string | null; name: string; spec?: string | null },
): { confidence: number; matched_by: string } {
  if (input.barcode && candidate.barcode && input.barcode === candidate.barcode) {
    return { confidence: 100, matched_by: 'barcode' }
  }
  if (
    input.item_report_number &&
    candidate.item_report_number &&
    input.item_report_number === candidate.item_report_number
  ) {
    return { confidence: 95, matched_by: 'item_report_number' }
  }
  const normalizedInput = normalizeProductName(input.name)
  const normalizedCandidate = normalizeProductName(candidate.name)
  if (normalizedInput && normalizedInput === normalizedCandidate) {
    if (input.spec && candidate.spec && input.spec === candidate.spec) {
      return { confidence: 80, matched_by: 'name_spec' }
    }
    return { confidence: 60, matched_by: 'name_spec' }
  }
  return { confidence: 0, matched_by: 'none' }
}

function toMatchedBy(value: string): 'barcode' | 'item_report_number' | 'name_spec' | 'ai' | 'manual' | null {
  if (value === 'barcode' || value === 'item_report_number' || value === 'name_spec' || value === 'ai' || value === 'manual') {
    return value
  }
  return null
}

export async function upsertIngredientMaster(input: {
  source_type: 'admin' | 'supplier' | 'restaurant'
  source_id: string
  name: string
  barcode?: string | null
  item_report_number?: string | null
  brand?: string | null
  spec?: string | null
  manufacturer?: string | null
  ingredients_text?: string | null
  price?: number | null
  tenant_id?: string | null
}): Promise<{ success: boolean; master_id?: string; matched_by?: string; confidence?: number; error?: string }> {
  const supabase = await createSupabaseAdmin()

  const barcode = input.barcode?.replace(/\D/g, '') || null
  const item_report_number = input.item_report_number?.trim() || null

  let existingMaster: MasterRow | null = null

  if (barcode) {
    const { data } = await supabase
      .from('ingredient_master')
      .select('id, name, barcode, item_report_number, spec')
      .eq('barcode', barcode)
      .maybeSingle()
    existingMaster = data
  }

  if (!existingMaster && item_report_number) {
    const { data } = await supabase
      .from('ingredient_master')
      .select('id, name, barcode, item_report_number, spec')
      .eq('item_report_number', item_report_number)
      .maybeSingle()
    existingMaster = data
  }

  if (!existingMaster) {
    const { data: candidates } = await supabase
      .from('ingredient_master')
      .select('id, name, barcode, item_report_number, spec')
      .limit(50)

    if (candidates) {
      const normalized = normalizeProductName(input.name)
      const match = candidates.find((c) => normalizeProductName(c.name) === normalized)
      if (match) existingMaster = match
    }
  }

  let masterId: string
  let matchConfidence: number
  let matchedBy: string

  if (existingMaster) {
    masterId = existingMaster.id
    const result = calcMatchConfidence(
      {
        barcode: existingMaster.barcode,
        item_report_number: existingMaster.item_report_number,
        name: existingMaster.name,
        spec: existingMaster.spec,
      },
      { barcode, item_report_number, name: input.name, spec: input.spec },
    )
    matchConfidence = result.confidence
    matchedBy = result.matched_by

    const updates: Record<string, string> = {}
    if (!existingMaster.barcode && barcode) updates.barcode = barcode
    if (!existingMaster.item_report_number && item_report_number) updates.item_report_number = item_report_number
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString()
      if (matchConfidence >= 95) updates.confidence_level = 'confirmed'
      await supabase.from('ingredient_master').update(updates).eq('id', masterId)
    }
  } else {
    const confidenceLevel = barcode || item_report_number ? 'confirmed' : 'unconfirmed'
    matchedBy = barcode ? 'barcode' : item_report_number ? 'item_report_number' : 'name_spec'
    matchConfidence = barcode ? 100 : item_report_number ? 95 : 40

    const { data: newMaster, error } = await supabase
      .from('ingredient_master')
      .insert({
        name: input.name,
        barcode,
        item_report_number,
        brand: input.brand || null,
        spec: input.spec || null,
        manufacturer: input.manufacturer || null,
        ingredients_text: input.ingredients_text || null,
        confidence_level: confidenceLevel,
      })
      .select('id')
      .single()

    if (error || !newMaster) return { success: false, error: error?.message ?? '마스터 생성 실패' }
    masterId = newMaster.id
  }

  await supabase.from('ingredient_mappings').upsert(
    {
      source_type: input.source_type,
      source_id: input.source_id,
      master_id: masterId,
      match_confidence: matchConfidence,
      matched_by: toMatchedBy(matchedBy),
      price: input.price || null,
      tenant_id: input.tenant_id || null,
    },
    { onConflict: 'source_type,source_id' },
  )

  return { success: true, master_id: masterId, matched_by: matchedBy, confidence: matchConfidence }
}

export async function getUnconfirmedMasters(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '권한 없음' }
  }
  const supabase = await createSupabaseAdmin()

  const { data, error } = await supabase
    .from('ingredient_master')
    .select(`
      id, name, barcode, item_report_number, brand, spec, manufacturer, created_at,
      ingredient_mappings (
        source_type, match_confidence, matched_by, price, tenant_id
      )
    `)
    .eq('confidence_level', 'unconfirmed')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function confirmMasterIngredient(masterId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '권한 없음' }
  }
  const supabase = await createSupabaseAdmin()

  const { error } = await supabase
    .from('ingredient_master')
    .update({ confidence_level: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', masterId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function mergeMasterIngredients(
  keepId: string,
  mergeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '권한 없음' }
  }
  const supabase = await createSupabaseAdmin()

  await supabase.from('ingredient_mappings').update({ master_id: keepId }).eq('master_id', mergeId)

  const { error } = await supabase.from('ingredient_master').delete().eq('id', mergeId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getConfirmedMasters(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
  try {
    await requireAdmin()
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '권한 없음' }
  }
  const supabase = await createSupabaseAdmin()

  const { data, error } = await supabase
    .from('ingredient_master')
    .select(`
      id, name, barcode, item_report_number, brand, spec, manufacturer, created_at,
      ingredient_mappings (
        source_type, match_confidence, price, tenant_id
      )
    `)
    .eq('confidence_level', 'confirmed')
    .order('name')
    .limit(200)

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}
