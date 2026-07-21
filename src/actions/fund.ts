'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { saleAmount } from '@/lib/ledger-calc'
import type { ActionResult } from '@/types/order'

// ============================================================
// 공통 헬퍼
// ============================================================

async function getCtx(supabase: any) {
  return getAuthCtx(supabase)
}

// KST 기준 오늘 날짜 (UTC+9 고정)
function todayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

// 해당 월 영업일수 계산 (주말 제외)
function getBusinessDaysInMonth(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate() // 해당 월 총 일수
  let count = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) count++ // 0=일, 6=토
  }
  return count
}

// 이번달 confirmed 매출 조회
async function getMonthlySales(
  supabase: any,
  tenant_id: string,
  year: number,
  month: number,
): Promise<number> {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = new Date(year, month, 0).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('orders')
    .select('total_amount, discount_amount, point_used')
    // 전환: seller_tenant_id 우선 (legacy tenant_id 병행)
    .or(`seller_tenant_id.eq.${tenant_id},tenant_id.eq.${tenant_id}`)
    .eq('status', 'confirmed')
    .is('deleted_at', null)
    .gte('order_date', from)
    .lte('order_date', to)

  return (data ?? []).reduce(
    (s: number, o: { total_amount: number; discount_amount?: number | null; point_used?: number | null }) =>
      s + saleAmount(o),
    0,
  )
}

// ============================================================
// account_purposes
// ============================================================

export interface AccountPurpose {
  id: string
  name: string
  is_active: boolean
}

export async function getAccountPurposes(): Promise<ActionResult<AccountPurpose[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('account_purposes')
    .select('id, name, is_active')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .order('name')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

export async function createAccountPurpose(name: string): Promise<ActionResult<AccountPurpose>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('account_purposes')
    .insert({ tenant_id: ctx.tenant_id, name: name.trim(), created_by: ctx.user_id })
    .select('id, name, is_active')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/funds')
  return { success: true, data }
}

// ============================================================
// accounts (계좌)
// ============================================================

export interface Account {
  id: string
  bank_name: string
  account_number: string
  account_name: string
  purpose_id: string | null
  purpose_name: string | null
  current_balance: number
  is_active: boolean
}

export interface CreateAccountInput {
  bank_name:      string
  account_number: string
  account_name:   string
  purpose_id?:    string
}

export async function getAccounts(): Promise<ActionResult<Account[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('accounts')
    .select('id, bank_name, account_number, account_name, purpose_id, current_balance, is_active, account_purposes(name)')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .order('created_at')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((a: any) => ({
      id:              a.id,
      bank_name:       a.bank_name,
      account_number:  a.account_number,
      account_name:    a.account_name,
      purpose_id:      a.purpose_id,
      purpose_name:    a.account_purposes?.name ?? null,
      current_balance: a.current_balance,
      is_active:       a.is_active,
    })),
  }
}

export async function createAccount(input: CreateAccountInput): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.bank_name.trim())      return { success: false, error: '은행명을 입력해주세요.' }
  if (!input.account_number.trim()) return { success: false, error: '계좌번호를 입력해주세요.' }
  if (!input.account_name.trim())   return { success: false, error: '계좌 별칭을 입력해주세요.' }

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      tenant_id:      ctx.tenant_id,
      bank_name:      input.bank_name.trim(),
      account_number: input.account_number.replace(/\s/g, ''),
      account_name:   input.account_name.trim(),
      purpose_id:     input.purpose_id || null,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/funds')
  return { success: true, data: { id: data.id } }
}

// ============================================================
// fund_rules (자금 규칙)
// ============================================================

export interface FundRule {
  id:               string
  account_id:       string
  account_name:     string
  rule_name:        string
  calculation_type: 'fixed' | 'percentage'
  base_type:        'sales'
  amount:           number
  priority:         number
  is_active:        boolean
}

export interface CreateFundRuleInput {
  account_id:       string
  rule_name:        string
  calculation_type: 'fixed' | 'percentage'
  amount:           number   // fixed: 월금액 / percentage: 비율(0~100)
  priority?:        number
}

export async function getFundRules(): Promise<ActionResult<FundRule[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('fund_rules')
    .select('id, account_id, rule_name, calculation_type, base_type, amount, priority, is_active, accounts(account_name)')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .order('priority')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id:               r.id,
      account_id:       r.account_id,
      account_name:     r.accounts?.account_name ?? '-',
      rule_name:        r.rule_name,
      calculation_type: r.calculation_type,
      base_type:        r.base_type,
      amount:           r.amount,
      priority:         r.priority,
      is_active:        r.is_active,
    })),
  }
}

export async function createFundRule(input: CreateFundRuleInput): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (!input.account_id)  return { success: false, error: '계좌를 선택해주세요.' }
  if (!input.rule_name.trim()) return { success: false, error: '규칙명을 입력해주세요.' }
  if (!input.amount || input.amount <= 0) return { success: false, error: '금액을 입력해주세요.' }
  if (input.calculation_type === 'percentage' && input.amount > 100)
    return { success: false, error: '비율은 100% 이하로 입력해주세요.' }

  const { data, error } = await supabase
    .from('fund_rules')
    .insert({
      tenant_id:        ctx.tenant_id,
      account_id:       input.account_id,
      rule_name:        input.rule_name.trim(),
      calculation_type: input.calculation_type,
      base_type:        'sales',
      amount:           input.amount,
      priority:         input.priority ?? 0,
    })
    .select('id')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? '저장 실패' }
  revalidatePath('/funds')
  return { success: true, data: { id: data.id } }
}

// ============================================================
// fund_transfers (자금 이체 계획)
// ============================================================

export interface FundTransfer {
  id:               string
  date:             string
  account_id:       string
  account_name:     string
  rule_name:        string
  planned_amount:   number
  actual_amount:    number | null
  carry_over_amount: number
  status:           'pending' | 'completed' | 'partial' | 'overdue'
}

export async function getDailyFundPlan(date?: string): Promise<ActionResult<FundTransfer[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const targetDate = date ?? todayKST()

  const { data, error } = await supabase
    .from('fund_transfers')
    .select('id, date, account_id, planned_amount, actual_amount, carry_over_amount, status, fund_rules(rule_name), accounts(account_name)')
    .eq('tenant_id', ctx.tenant_id)
    .eq('date', targetDate)
    .order('created_at')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((t: any) => ({
      id:                t.id,
      date:              t.date,
      account_id:        t.account_id,
      account_name:      t.accounts?.account_name ?? '-',
      rule_name:         t.fund_rules?.rule_name ?? '-',
      planned_amount:    t.planned_amount,
      actual_amount:     t.actual_amount,
      carry_over_amount: t.carry_over_amount,
      status:            t.status,
    })),
  }
}

export async function generateDailyFundPlan(date?: string): Promise<ActionResult<{ created: number }>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const targetDate = date ?? todayKST()
  const d     = new Date(targetDate)
  const year  = d.getFullYear()
  const month = d.getMonth() + 1

  // 영업일수 계산 (주말 제외)
  const bizDays = getBusinessDaysInMonth(year, month)
  if (bizDays === 0) return { success: false, error: '영업일수 계산 오류' }

  // 이번달 매출 조회
  const monthlySales = await getMonthlySales(supabase, ctx.tenant_id, year, month)

  // 활성 규칙 조회
  const { data: rules, error: rulesErr } = await supabase
    .from('fund_rules')
    .select('id, account_id, calculation_type, amount')
    .eq('tenant_id', ctx.tenant_id)
    .eq('is_active', true)
    .order('priority')

  if (rulesErr) return { success: false, error: rulesErr.message }
  if (!rules?.length) return { success: true, data: { created: 0 } }

  // 각 규칙별 일일 금액 계산
  const rows = rules.map((r: any) => {
    let planned_amount = 0
    if (r.calculation_type === 'fixed') {
      // PRODUCT: 소수점 버림
      planned_amount = Math.floor(r.amount / bizDays)
    } else {
      // PRODUCT: 소수점 버림
      planned_amount = Math.floor((monthlySales * (r.amount / 100)) / bizDays)
    }
    return {
      account_id:     r.account_id,
      rule_id:        r.id,
      planned_amount: Math.max(0, planned_amount),
      // date는 RPC 내부에서 DB KST 기준으로 자동 처리
    }
  })

  // RPC: ON CONFLICT (tenant_id, account_id, date) DO NOTHING — DB 레벨 보장
  const { data: created, error: rpcErr } = await supabase.rpc('generate_fund_transfers', {
    p_tenant_id: ctx.tenant_id,
    p_rows:      JSON.stringify(rows),
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  revalidatePath('/funds')
  return { success: true, data: { created: created ?? 0 } }
}

// ============================================================
// 이체 완료 처리
// ============================================================

export async function completeFundTransfer(
  transfer_id: string,
  actual_amount: number,
): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  if (actual_amount < 0) return { success: false, error: '금액은 0 이상이어야 합니다.' }

  const { data: transfer } = await supabase
    .from('fund_transfers')
    .select('planned_amount, carry_over_amount, date, account_id, rule_id, status')
    .eq('id', transfer_id)
    .eq('tenant_id', ctx.tenant_id)
    .single()
  if (!transfer) return { success: false, error: '이체 항목을 찾을 수 없습니다.' }

  const planned = (transfer as any).planned_amount as number
  const carry = (transfer as any).carry_over_amount as number
  const required = planned + carry

  const status: FundTransfer['status'] =
    actual_amount === 0 ? 'pending' : actual_amount >= required ? 'completed' : 'partial'

  const carryForward = Math.max(0, required - actual_amount)

  const { error } = await supabase
    .from('fund_transfers')
    .update({
      actual_amount,
      status,
      // 완료 시: 과거 이월은 정산되었으므로 carry_over_amount=0으로 리셋
      carry_over_amount: status === 'completed' ? 0 : carry,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transfer_id)
    .eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }

  // 미이행 금액 이월: 다음날 동일 account_id(+rule_id) 행의 carry_over_amount에 누적
  if (carryForward > 0) {
    const next = new Date((transfer as any).date + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    const nextDate = next.toISOString().slice(0, 10)

    const account_id = (transfer as any).account_id as string
    const rule_id = (transfer as any).rule_id as string | null

    const { data: nextRow, error: nextErr } = await supabase
      .from('fund_transfers')
      .select('id, carry_over_amount')
      .eq('tenant_id', ctx.tenant_id)
      .eq('date', nextDate)
      .eq('account_id', account_id)
      .eq('rule_id', rule_id)
      .maybeSingle()

    if (nextErr) return { success: false, error: nextErr.message }

    if (!nextRow) {
      // 다음날 행이 없으면 생성(기본 planned_amount=0; generateDailyFundPlan이 별도 planned를 채움)
      const { error: insErr } = await supabase.from('fund_transfers').insert({
        tenant_id: ctx.tenant_id,
        date: nextDate,
        account_id,
        rule_id,
        planned_amount: 0,
        actual_amount: null,
        carry_over_amount: carryForward,
        status: 'pending',
      })
      if (insErr) return { success: false, error: insErr.message }
    } else {
      const { error: upErr } = await supabase
        .from('fund_transfers')
        .update({
          carry_over_amount: (nextRow.carry_over_amount ?? 0) + carryForward,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', ctx.tenant_id)
        .eq('id', nextRow.id)
      if (upErr) return { success: false, error: upErr.message }
    }
  }

  revalidatePath('/funds')
  return { success: true }
}

// ============================================================
// settings용 추가 함수
// ============================================================

// 비활성 계좌 포함 전체 목록
export async function getAllAccounts(): Promise<ActionResult<Account[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('accounts')
    .select('id, bank_name, account_number, account_name, purpose_id, current_balance, is_active, account_purposes(name)')
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((a: any) => ({
      id: a.id, bank_name: a.bank_name, account_number: a.account_number,
      account_name: a.account_name, purpose_id: a.purpose_id,
      purpose_name: a.account_purposes?.name ?? null,
      current_balance: a.current_balance, is_active: a.is_active,
    })),
  }
}

// 계좌 활성/비활성 토글
export async function toggleAccount(account_id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('accounts').update({ is_active })
    .eq('id', account_id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/funds')
  revalidatePath('/funds/settings')
  return { success: true }
}

// 자금 규칙 비활성화 (soft delete)
export async function toggleFundRule(rule_id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('fund_rules').update({ is_active })
    .eq('id', rule_id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/funds')
  revalidatePath('/funds/settings')
  return { success: true }
}

// 비활성 목적 포함 전체 목록
export async function getAllAccountPurposes(): Promise<ActionResult<AccountPurpose[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('account_purposes').select('id, name, is_active')
    .eq('tenant_id', ctx.tenant_id).order('name')

  if (error) return { success: false, error: error.message }
  return { success: true, data: data ?? [] }
}

// 자금 목적 비활성화 토글
export async function toggleAccountPurpose(purpose_id: string, is_active: boolean): Promise<ActionResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { error } = await supabase
    .from('account_purposes').update({ is_active })
    .eq('id', purpose_id).eq('tenant_id', ctx.tenant_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/funds/settings')
  return { success: true }
}

// 비활성 규칙 포함 전체 목록
export async function getAllFundRules(): Promise<ActionResult<FundRule[]>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const { data, error } = await supabase
    .from('fund_rules')
    .select('id, account_id, rule_name, calculation_type, base_type, amount, priority, is_active, accounts(account_name)')
    .eq('tenant_id', ctx.tenant_id)
    .order('priority')

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id, account_id: r.account_id, account_name: r.accounts?.account_name ?? '-',
      rule_name: r.rule_name, calculation_type: r.calculation_type, base_type: r.base_type,
      amount: r.amount, priority: r.priority, is_active: r.is_active,
    })),
  }
}

// ============================================================
// 자금 규칙 미리보기 (settings UI용)
// ============================================================

export interface FundRulePreview {
  rule_id:        string
  rule_name:      string
  account_id:     string
  account_name:   string
  calculation_type: 'fixed' | 'percentage'
  amount:         number
  daily_amount:   number    // 오늘 기준 일 이체 금액
  is_active:      boolean
}

export interface FundPreviewResult {
  monthly_sales:        number
  biz_days:             number
  rules:                FundRulePreview[]
  total_daily:          number           // 활성 규칙 일 이체 합계
  pct_total:            number           // percentage 합계
  warnings:             string[]
}

export async function getFundPreview(): Promise<ActionResult<FundPreviewResult>> {
  const supabase = await createSupabaseServer()
  const ctx = await getCtx(supabase)
  if (!ctx) return { success: false, error: '로그인 필요' }

  const kst   = new Date(Date.now() + 9 * 3600000)
  const year  = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + 1

  const biz_days     = getBusinessDaysInMonth(year, month)
  const monthly_sales = await getMonthlySales(supabase, ctx.tenant_id, year, month)

  const { data: rulesRaw, error } = await supabase
    .from('fund_rules')
    .select('id, account_id, rule_name, calculation_type, amount, priority, is_active, accounts(account_name, current_balance)')
    .eq('tenant_id', ctx.tenant_id)
    .order('priority')

  if (error) return { success: false, error: error.message }

  const rules: FundRulePreview[] = (rulesRaw ?? []).map((r: any) => {
    let daily_amount = 0
    if (r.is_active && biz_days > 0) {
      daily_amount = r.calculation_type === 'fixed'
        ? Math.floor(r.amount / biz_days)
        : Math.floor((monthly_sales * (r.amount / 100)) / biz_days)
      daily_amount = Math.max(0, daily_amount)
    }
    return {
      rule_id:          r.id,
      rule_name:        r.rule_name,
      account_id:       r.account_id,
      account_name:     r.accounts?.account_name ?? '-',
      calculation_type: r.calculation_type,
      amount:           r.amount,
      daily_amount,
      is_active:        r.is_active,
    }
  })

  const activeRules  = rules.filter((r) => r.is_active)
  const total_daily  = activeRules.reduce((s, r) => s + r.daily_amount, 0)
  const pct_total    = activeRules
    .filter((r) => r.calculation_type === 'percentage')
    .reduce((s, r) => s + r.amount, 0)

  const warnings: string[] = []
  if (pct_total > 100)
    warnings.push(`비율 규칙 합계가 ${pct_total}%로 100%를 초과합니다. 설정을 검토해주세요.`)
  if (pct_total > 80 && pct_total <= 100)
    warnings.push(`비율 규칙 합계가 ${pct_total}%로 매우 높습니다.`)

  // 계좌별 잔액 vs 일 이체 합계 검증
  const accountDailyMap = new Map<string, number>()
  for (const r of activeRules)
    accountDailyMap.set(r.account_id, (accountDailyMap.get(r.account_id) ?? 0) + r.daily_amount)

  for (const r of rulesRaw ?? []) {
    const daily = accountDailyMap.get(r.account_id) ?? 0
    const acc   = Array.isArray((r as any).accounts) ? (r as any).accounts[0] : (r as any).accounts
    const bal   = acc?.current_balance ?? 0
    const accName = acc?.account_name ?? '-'
    if (daily > 0 && bal > 0 && daily > bal)
      warnings.push(`[${accName}] 일 이체 합계(${daily.toLocaleString()}원)가 계좌 잔액(${bal.toLocaleString()}원)보다 큽니다.`)
  }

  return {
    success: true,
    data: { monthly_sales, biz_days, rules, total_daily, pct_total, warnings },
  }
}
