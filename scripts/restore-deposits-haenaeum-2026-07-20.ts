/**
 * 1회성 데이터 정정 — 해내음코리아 예치금 리셋 원복 (2026-07-20 잘못 실행분)
 *
 * 목적: 2026-07-20 reset-deposits-haenaeum 스크립트가 "오래된 전산오류"로
 *       오판하여 0원 정정한 6곳 예치금을 전액 원복.
 *       조사 결과 6곳 전부 deposit_logs(payment_over) 합산 = 리셋 직전 잔액
 *       → 전액 정상 자금이었음.
 * 대상: TENANT_ID 하드코딩 (다른 테넌트 실행 금지)
 * 재사용 금지 — 보관용 기록. 관리자 UI 없음.
 *
 * 사용:
 *   npx tsx scripts/restore-deposits-haenaeum-2026-07-20.ts           # 1단계: 잔액 확인만
 *   npx tsx scripts/restore-deposits-haenaeum-2026-07-20.ts --execute # 2단계: 원복 실행
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const TENANT_ID = '5bf7aa92-7eaa-4f0e-a75f-89310c7b275d'
const TENANT_NAME = '해내음코리아'
const RESTORE_REASON =
  '정정취소: 07-20 예치금 리셋이 잘못된 전제(오래된 오류로 오판)로 실행됐음이 조사로 확인되어 원복함. 실제로는 payment_over(수금 초과)로 쌓인 정상 자금이었음.'

/** 어제 리셋 대상 6곳 — customer_id·금액 고정 (DB명: 강름엄지네) */
const TARGETS: Array<{ customer_id: string; customer_name: string; amount: number }> = [
  { customer_id: '4e81ff64-0693-42a8-a31d-355230280271', customer_name: '옛날두부', amount: 736800 },
  { customer_id: 'b74329da-20b6-49a2-bdd4-8f325a88be8c', customer_name: '맛찬들왕소금구이 삼성점', amount: 553382 },
  { customer_id: 'cabe4688-4695-4f2a-9e9f-7949981ca5cf', customer_name: '강름엄지네(서주환)', amount: 147000 },
  { customer_id: 'ce800268-ad9d-45fa-acb6-85ac3ca62817', customer_name: '신신초마', amount: 121000 },
  { customer_id: '929b685c-c388-40a3-acbd-670203d66920', customer_name: '옥수수주먹고기', amount: 73500 },
  { customer_id: '42c20ed7-a468-41cf-9d45-7d43800d1398', customer_name: '유동일', amount: 32000 },
]

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

type LiveRow = {
  customer_id: string
  customer_name: string
  amount: number
  deposit_id: string | null
  balance: number
}

async function loadLiveRows(supabase: SupabaseClient): Promise<LiveRow[]> {
  const out: LiveRow[] = []
  for (const t of TARGETS) {
    const { data: dep, error } = await supabase
      .from('customer_deposits')
      .select('id, balance')
      .eq('tenant_id', TENANT_ID)
      .eq('customer_id', t.customer_id)
      .maybeSingle()

    if (error) throw new Error(`${t.customer_name}: deposits 조회 실패 — ${error.message}`)

    out.push({
      customer_id: t.customer_id,
      customer_name: t.customer_name,
      amount: t.amount,
      deposit_id: dep?.id ?? null,
      balance: Number(dep?.balance ?? 0) || 0,
    })
  }
  return out
}

function preview(rows: LiveRow[]) {
  console.log('=== 1단계: 원복 대상 현재 잔액 확인 (변경 없음) ===')
  console.log(`테넌트: ${TENANT_NAME}`)
  console.log(`tenant_id: ${TENANT_ID}`)
  console.log(`대상: ${rows.length}곳 / 원복 합계 ${fmt(rows.reduce((s, r) => s + r.amount, 0))}원\n`)

  console.log('거래처\t원복금액\t현재잔액\t상태')
  console.log('─'.repeat(64))
  let allZero = true
  for (const r of rows) {
    const ok = r.balance === 0
    if (!ok) allZero = false
    console.log(
      `${r.customer_name}\t${fmt(r.amount)}원\t${fmt(r.balance)}원\t${ok ? 'OK(0)' : '⚠ 0 아님'}`,
    )
  }
  console.log('─'.repeat(64))

  if (!allZero) {
    console.log('\n⚠ 경고: 현재 잔액이 0이 아닌 거래처가 있습니다.')
    console.log('그 사이 다른 거래가 있었을 수 있으므로 --execute를 중단합니다.')
    console.log('잔액 확인 후 수동 판단이 필요합니다.')
    return false
  }
  console.log('\n전원 현재 잔액 0원 — 원복 실행 가능 (--execute 승인 대기)')
  return true
}

/**
 * credit 원복: balance 증가 → deposit_logs credit.
 * 로그 실패 시 balance 롤백 (payment_over / restoreOrderDeposit 패턴).
 */
async function restoreOne(
  supabase: SupabaseClient,
  row: LiveRow,
): Promise<{ ok: true; balance_after: number } | { ok: false; reason: string }> {
  if (row.balance !== 0) {
    return { ok: false, reason: `현재 잔액이 0이 아님 (${row.balance}) — skip` }
  }
  if (!row.amount || row.amount <= 0 || !Number.isInteger(row.amount)) {
    return { ok: false, reason: '원복 금액이 양의 정수가 아님' }
  }

  const { data: dep, error: depErr } = await supabase
    .from('customer_deposits')
    .select('id, balance')
    .eq('tenant_id', TENANT_ID)
    .eq('customer_id', row.customer_id)
    .maybeSingle()

  if (depErr) return { ok: false, reason: depErr.message }

  const before = Number(dep?.balance ?? 0) || 0
  if (before !== 0) {
    return { ok: false, reason: `잔액 변경됨 (현재 ${before}) — skip` }
  }

  const after = before + row.amount
  const now = new Date().toISOString()

  if (!dep) {
    const { error: insErr } = await supabase.from('customer_deposits').insert({
      tenant_id: TENANT_ID,
      customer_id: row.customer_id,
      balance: after,
      updated_at: now,
    })
    if (insErr) return { ok: false, reason: insErr.message }
  } else {
    const { data: updated, error: upErr } = await supabase
      .from('customer_deposits')
      .update({ balance: after, updated_at: now })
      .eq('tenant_id', TENANT_ID)
      .eq('id', dep.id)
      .eq('balance', 0) // 동시성: 여전히 0일 때만
      .select('id')
      .maybeSingle()

    if (upErr) return { ok: false, reason: upErr.message }
    if (!updated) return { ok: false, reason: 'balance update 0건 (동시성 또는 잔액≠0)' }
  }

  const { error: logErr } = await supabase.from('deposit_logs').insert({
    tenant_id: TENANT_ID,
    customer_id: row.customer_id,
    amount: row.amount,
    type: 'credit',
    reason: RESTORE_REASON,
    payment_id: null,
  })

  if (logErr) {
    if (dep) {
      await supabase
        .from('customer_deposits')
        .update({ balance: before, updated_at: now })
        .eq('tenant_id', TENANT_ID)
        .eq('id', dep.id)
    } else {
      await supabase
        .from('customer_deposits')
        .update({ balance: 0, updated_at: now })
        .eq('tenant_id', TENANT_ID)
        .eq('customer_id', row.customer_id)
    }
    return { ok: false, reason: `deposit_logs insert 실패 (롤백됨): ${logErr.message}` }
  }

  return { ok: true, balance_after: after }
}

async function execute(supabase: SupabaseClient, rows: LiveRow[]) {
  const nonZero = rows.filter((r) => r.balance !== 0)
  if (nonZero.length) {
    console.error('=== 실행 중단: 잔액이 0이 아닌 거래처 있음 ===')
    for (const r of nonZero) {
      console.error(`  - ${r.customer_name}: 현재 ${fmt(r.balance)}원 (원복 예정 ${fmt(r.amount)}원)`)
    }
    process.exit(2)
  }

  console.log('=== 2단계: 예치금 원복 실행 ===')
  console.log(`테넌트: ${TENANT_NAME} (${TENANT_ID})\n`)

  const okList: LiveRow[] = []
  const failList: Array<LiveRow & { reason: string }> = []

  for (const row of rows) {
    const res = await restoreOne(supabase, row)
    if (res.ok) {
      okList.push(row)
      console.log(`OK  ${row.customer_name}  +${fmt(row.amount)}원 → ${fmt(res.balance_after)}원`)
    } else {
      failList.push({ ...row, reason: res.reason })
      console.warn(`FAIL ${row.customer_name}: ${res.reason}`)
    }
  }

  console.log('\n=== 요약 ===')
  console.log(`성공: ${okList.length}건 / ${fmt(okList.reduce((s, r) => s + r.amount, 0))}원`)
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

  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', TENANT_ID)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!tenant) throw new Error(`tenant_id ${TENANT_ID} 없음`)

  const rows = await loadLiveRows(supabase)
  const executeMode = process.argv.includes('--execute')

  if (!executeMode) {
    preview(rows)
    console.log('\n※ 원복 실행은 승인 후: npx tsx scripts/restore-deposits-haenaeum-2026-07-20.ts --execute')
    return
  }

  await execute(supabase, rows)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
