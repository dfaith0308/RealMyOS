'use server'

import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { VALID_TERMS_TYPES, VALID_CUSTOMER_TYPES } from '@/lib/customer-csv'
import type { ActionResult } from '@/types/order'

export interface BulkCustomerRow {
  business_number?: string
  customer_type?: string
  name: string
  representative_name?: string
  phone?: string
  address?: string
  business_type?: string
  payment_terms_type?: string
  payment_day?: string
  payment_terms_days?: string
  opening_balance?: string
  opening_balance_date?: string
  target_monthly_revenue?: string
  acquisition_channel?: string
}

export interface BulkResult {
  success_count: number
  fail_count: number
  failures: Array<{ row: number; name: string; reason: string }>
  warning_count: number
  warning_rows: Array<{ row: number; name: string; reason: string }>
}

// ── validation ────────────────────────────────────────────────

function validateRow(row: BulkCustomerRow, index: number): string | null {
  if (!row.name?.trim()) return '이름(name) 필수'
  if (
    row.customer_type &&
    !VALID_CUSTOMER_TYPES.includes(row.customer_type as any)
  ) return `customer_type 오류: ${row.customer_type}`
  if (
    row.payment_terms_type &&
    !VALID_TERMS_TYPES.includes(row.payment_terms_type as any)
  ) return `payment_terms_type 오류: ${row.payment_terms_type}`
  if (row.payment_day && isNaN(Number(row.payment_day)))
    return 'payment_day는 숫자여야 합니다'
  if (row.opening_balance && isNaN(Number(row.opening_balance)))
    return 'opening_balance는 숫자여야 합니다'
  if (row.target_monthly_revenue && isNaN(Number(row.target_monthly_revenue)))
    return 'target_monthly_revenue는 숫자여야 합니다'
  return null
}

// ── bulk upsert ───────────────────────────────────────────────

export async function bulkUpsertCustomers(
  rows: BulkCustomerRow[],
): Promise<ActionResult<BulkResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const tenant_id = ctx.tenant_id
  const today = new Date().toISOString().slice(0, 10)

  // 1. acquisition_channel 이름 → id 맵 (N+1 방지: 한 번에 조회)
  const channelNames = [
    ...new Set(
      rows.map((r) => r.acquisition_channel?.trim()).filter((n): n is string => Boolean(n)),
    ),
  ]
  const { data: existingChannels } = await supabase
    .from('acquisition_channels')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .in('name', channelNames)

  const channelMap = new Map((existingChannels ?? []).map((c) => [c.name, c.id]))

  // 없는 채널 자동 생성
  const missingChannels = channelNames.filter((n) => n && !channelMap.has(n))
  if (missingChannels.length > 0) {
    const { data: newChannels } = await supabase
      .from('acquisition_channels')
      .insert(
        missingChannels.map((name) => ({
          tenant_id,
          name,
          code: name!.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36),
          created_by: ctx.user_id,
        }))
      )
      .select('id, name')
    ;(newChannels ?? []).forEach((c) => channelMap.set(c.name, c.id))
  }

  // 2. business_number 있는 row → 기존 고객 조회 (N+1 방지)
  const bizNumbers = rows
    .map((r) => r.business_number?.replace(/-/g, '').trim())
    .filter(Boolean) as string[]

  const { data: existingCustomers } = bizNumbers.length > 0
    ? await supabase
        .from('customers')
        .select('id, biz_number, opening_balance')
        .eq('tenant_id', tenant_id)
        .in('biz_number', bizNumbers)
    : { data: [] }

  const existingMap = new Map(
    (existingCustomers ?? []).map((c) => [c.biz_number, c])
  )

  // 3. name+phone 기준 중복 탐지용 맵 (business_number 없는 row 대상)
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('name, phone')
    .eq('tenant_id', tenant_id)
    .is('deleted_at', null)

  // "name::phone" → true
  // phone 정규화 (하이픈 제거) 후 Set 생성
  const namePhoneSet = new Set(
    (allCustomers ?? []).map((c) => `${c.name}::${(c.phone ?? '').replace(/-/g, '')}`)
  )

  // 4. 행별 처리
  const result: BulkResult = { success_count: 0, fail_count: 0, failures: [], warning_count: 0, warning_rows: [] }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 헤더 + 1-index

    const validErr = validateRow(row, i)
    if (validErr) {
      result.fail_count++
      result.failures.push({ row: rowNum, name: row.name ?? '', reason: validErr })
      continue
    }

    const bizNum = row.business_number?.replace(/-/g, '').trim() || null
    const openingBalance = row.opening_balance ? Number(row.opening_balance) : 0
    const channelId = row.acquisition_channel?.trim()
      ? channelMap.get(row.acquisition_channel.trim()) ?? null
      : null

    const payload = {
      tenant_id,
      customer_type:          (row.customer_type as any) ?? 'business',
      name:                   row.name.trim(),
      biz_number:             bizNum,
      representative_name:    row.representative_name?.trim() || null,
      phone:                  row.phone?.trim() || null,
      address:                row.address?.trim() || null,
      business_type:          row.business_type?.trim() || null,
      payment_terms_type:     (row.payment_terms_type as any) ?? 'immediate',
      payment_terms_days:     row.payment_terms_days ? Number(row.payment_terms_days) : 0,
      payment_day:            row.payment_day ? Number(row.payment_day) : null,
      opening_balance:        openingBalance,
      opening_balance_date:   row.opening_balance_date || today,
      target_monthly_revenue: row.target_monthly_revenue ? Number(row.target_monthly_revenue) : null,
      acquisition_channel_id: channelId,
      is_buyer:               true,
      is_supplier:            false,
      trade_status:           'active',
      status:                 'active',
    }

    try {
      const existing = bizNum ? existingMap.get(bizNum) : null

      // business_number 없는 row → name+phone 중복 경고
      if (!bizNum) {
        const key = `${payload.name}::${(payload.phone ?? '').replace(/-/g, '')}`
        if (namePhoneSet.has(key)) {
          result.warning_count++
          result.warning_rows.push({
            row: rowNum,
            name: row.name ?? '',
            reason: `동일 이름+연락처 거래처가 이미 존재합니다 (${row.name} / ${row.phone ?? '없음'})`,
          })
          // 경고만 기록하고 등록은 계속 진행
        }
      }

      if (existing) {
        // UPDATE
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', existing.id)
          .eq('tenant_id', tenant_id)

        if (error) throw new Error(error.message)

        // opening_balance 변경 로그
        if (openingBalance !== (existing.opening_balance ?? 0)) {
          await supabase.from('opening_balance_logs').insert({
            tenant_id,
            customer_id:   existing.id,
            before_amount: existing.opening_balance ?? 0,
            after_amount:  openingBalance,
            changed_by:    ctx.user_id,
            reason:        'CSV 대량등록 수정',
          })
        }
      } else {
        // INSERT
        const { data: newCustomer, error } = await supabase
          .from('customers')
          .insert(payload)
          .select('id')
          .single()

        if (error || !newCustomer) throw new Error(error?.message ?? '저장 실패')

        // opening_balance 이력
        if (openingBalance !== 0) {
          await supabase.from('opening_balance_logs').insert({
            tenant_id,
            customer_id:   newCustomer.id,
            before_amount: 0,
            after_amount:  openingBalance,
            changed_by:    ctx.user_id,
            reason:        'CSV 대량등록',
          })
        }
      }

      result.success_count++
    } catch (e: any) {
      result.fail_count++
      result.failures.push({ row: rowNum, name: row.name ?? '', reason: e.message })
    }
  }

  return { success: true, data: result }
}
