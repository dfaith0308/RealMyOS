/**
 * 1회성 데이터 정정 — 해내음코리아 예치금 오류 잔액 리셋
 *
 * 목적: 전산오류로 주문 매칭이 깨지며 customer_deposits.balance에 잘못 누적된
 *       양수 잔액을 전부 0원으로 정정 (2026-07-20, 정무님 확인)
 * 대상: tenants.name = 해내음코리아 (TENANT_NAME 상수)
 * 재사용 금지 — 실행 후 보관용 기록만. 관리자 UI 없음.
 *
 * 사용:
 *   npx tsx scripts/reset-deposits-haenaeum-2026-07-20.ts           # 1단계: 조회만
 *   npx tsx scripts/reset-deposits-haenaeum-2026-07-20.ts --execute # 2단계: 정정 실행
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── 대상 테넌트 (이름으로 조회 후 tenant_id 고정 검증) ──
const TENANT_NAME = '해내음코리아'
const RESET_REASON =
  '정정: 전산오류로 주문 매칭 오류 인해 예치금 처리된 금액 리셋 (2026-07-20)'

function loadEnv() {
  for (const f of ['.env.local', '.env.development', '.env']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i <= 0) continue
      const k = t.slice(0, i).trim()
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('ko-KR')
}

type TargetRow = {
  customer_id: string
  customer_name: string
  deposit_id: string
  balance: number
}

async function resolveTenantId(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name')
    .ilike('name', `%${TENANT_NAME}%`)

  if (error) throw new Error(`tenants 조회 실패: ${error.message}`)
  if (!data?.length) throw new Error(`테넌트 "${TENANT_NAME}" 없음`)

  const exact = data.find((t) => String(t.name).trim() === TENANT_NAME)
  const row = exact ?? (data.length === 1 ? data[0] : null)
  if (!row) {
    throw new Error(
      `테넌트 "${TENANT_NAME}"가 여러 건 매칭됨 — 수동 확인 필요:\n` +
        data.map((t) => `  - ${t.name} (${t.id})`).join('\n'),
    )
  }
  return row as { id: string; name: string }
}

async function fetchTargets(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<TargetRow[]> {
  const { data: deposits, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, customer_id, balance')
    .eq('tenant_id', tenantId)
    .gt('balance', 0)
    .order('balance', { ascending: false })

  if (depErr) throw new Error(`customer_deposits 조회 실패: ${depErr.message}`)
  if (!deposits?.length) return []

  const customerIds = deposits.map((d) => d.customer_id)
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', customerIds)

  if (custErr) throw new Error(`customers 조회 실패: ${custErr.message}`)

  const nameById = new Map((customers ?? []).map((c) => [c.id, c.name ?? '(이름 없음)']))

  return deposits.map((d) => ({
    customer_id: d.customer_id,
    customer_name: nameById.get(d.customer_id) ?? '(거래처 없음)',
    deposit_id: d.id,
    balance: Number(d.balance) || 0,
  }))
}

async function preview(tenantId: string, tenantName: string, targets: TargetRow[]) {
  const total = targets.reduce((s, r) => s + r.balance, 0)
  console.log('=== 1단계: 예치금 양수 잔액 조회 (변경 없음) ===')
  console.log(`테넌트: ${tenantName}`)
  console.log(`tenant_id: ${tenantId}`)
  console.log(`대상 거래처: ${targets.length}곳`)
  console.log(`합계 잔액: ${fmt(total)}원\n`)

  if (targets.length === 0) {
    console.log('양수 예치금 잔액 없음.')
    return
  }

  console.log('거래처명\t현재 잔액')
  console.log('─'.repeat(48))
  for (const r of targets) {
    console.log(`${r.customer_name}\t${fmt(r.balance)}원`)
  }
  console.log('─'.repeat(48))
  console.log(`합계\t${fmt(total)}원`)
}

/**
 * useDeposit() 패턴: balance update → deposit_logs insert → 로그 실패 시 balance 롤백
 * .gte('balance', amount)로 동시 변경 시 skip
 */
async function resetOne(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  row: TargetRow,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const amount = row.balance
  if (amount <= 0 || !Number.isInteger(amount)) {
    return { ok: false, reason: '잔액이 양의 정수가 아님' }
  }

  const { data: dep, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, balance')
    .eq('tenant_id', tenantId)
    .eq('id', row.deposit_id)
    .maybeSingle()

  if (depErr) return { ok: false, reason: depErr.message }
  if (!dep) return { ok: false, reason: 'customer_deposits 행 없음' }

  const before = Number(dep.balance) || 0
  if (before !== amount) {
    return {
      ok: false,
      reason: `잔액 변경됨 (예상 ${amount}, 현재 ${before}) — skip`,
    }
  }
  if (before < amount) {
    return { ok: false, reason: '예치금 잔액 부족' }
  }

  const after = 0
  const now = new Date().toISOString()

  const { data: updated, error: upErr } = await supabase
    .from('customer_deposits')
    .update({ balance: after, updated_at: now })
    .eq('tenant_id', tenantId)
    .eq('id', dep.id)
    .gte('balance', amount)
    .select('id')
    .maybeSingle()

  if (upErr) return { ok: false, reason: upErr.message }
  if (!updated) {
    return { ok: false, reason: 'balance update 0건 (.gte 동시성 또는 잔액 부족)' }
  }

  const { error: logErr } = await supabase.from('deposit_logs').insert({
    tenant_id: tenantId,
    customer_id: row.customer_id,
    amount,
    type: 'debit',
    reason: RESET_REASON,
    payment_id: null,
  })

  if (logErr) {
    await supabase
      .from('customer_deposits')
      .update({ balance: before, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', dep.id)
    return { ok: false, reason: `deposit_logs insert 실패 (롤백됨): ${logErr.message}` }
  }

  return { ok: true }
}

async function execute(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  tenantName: string,
  targets: TargetRow[],
) {
  console.log('=== 2단계: 예치금 0원 정정 실행 ===')
  console.log(`테넌트: ${tenantName} (${tenantId})\n`)

  const okList: TargetRow[] = []
  const failList: Array<TargetRow & { reason: string }> = []

  for (const row of targets) {
    const res = await resetOne(supabase, tenantId, row)
    if (res.ok) {
      okList.push(row)
      console.log(`OK  ${row.customer_name}  -${fmt(row.balance)}원`)
    } else {
      failList.push({ ...row, reason: res.reason })
      console.warn(`FAIL ${row.customer_name}: ${res.reason}`)
    }
  }

  console.log('\n=== 요약 ===')
  console.log(`성공: ${okList.length}건`)
  console.log(`실패: ${failList.length}건`)
  if (failList.length) {
    console.log('\n실패 목록:')
    for (const f of failList) {
      console.log(`  - ${f.customer_name} (${f.customer_id}): ${f.reason}`)
    }
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const executeMode = process.argv.includes('--execute')
  const tenant = await resolveTenantId(supabase)
  const targets = await fetchTargets(supabase, tenant.id)

  if (!executeMode) {
    await preview(tenant.id, tenant.name, targets)
    console.log('\n※ 정정 실행은 승인 후: npx tsx scripts/reset-deposits-haenaeum-2026-07-20.ts --execute')
    return
  }

  if (targets.length === 0) {
    console.log('정정 대상 없음.')
    return
  }

  await execute(supabase, tenant.id, tenant.name, targets)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
