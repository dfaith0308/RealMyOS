/**
 * 구독 자동 재청구 — 전 과정 검증 (테스트 키 전용)
 *
 * 검증 시나리오
 *   1. 토스 테스트 키로 빌링키 발급 (테스트 카드)
 *   2. 임시 테스트 테넌트 생성 — plan=monthly, plan_expires_at = 1분 뒤 만료
 *   3. 만료 직후 재청구 실행 → 성공 / 만료일 +1개월 연장 / 이력·활동기록 확인
 *   4. 같은 날 재실행 → 중복청구 차단(23505) 확인
 *   5. 실패 경로: 잘못된 빌링키로 3일치를 시뮬레이션(now 를 하루씩 이동)
 *      → retrying(1,2) → failed(3) → 4일째엔 조회 대상에서 제외되는지 확인
 *   6. 쿠폰 무료기간 테넌트가 제외되는지 확인
 *   7. 임시 테넌트·쿠폰 정리
 *
 * 안전장치
 *   - TOSS_SECRET_KEY 가 test_sk_ 로 시작하지 않으면 즉시 중단한다. 운영 키로는 절대 안 돈다.
 *   - 이 스크립트가 만든 테넌트(이름 __renewal_test__ 접두)만 건드리고, 끝나면 지운다.
 *   - 기존 테넌트는 읽지도 쓰지도 않는다.
 *
 * 사용:
 *   npx tsx scripts/verify-billing-renewal.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runSubscriptionRenewal, MAX_RETRY } from '../src/lib/subscription-renewal'

const TEST_PREFIX = '__renewal_test__'

function loadEnv(path: string) {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const pass: string[] = []
const fail: string[] = []
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    pass.push(label)
    console.log(`  PASS  ${label}`)
  } else {
    fail.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

/** 토스 테스트 키로 카드 직접입력 빌링키 발급 */
async function issueTestBillingKey(secretKey: string, customerKey: string) {
  const encoded = Buffer.from(`${secretKey}:`).toString('base64')
  const body = {
    customerKey,
    cardNumber: process.env.TEST_CARD_NUMBER ?? '4330123412341234',
    cardExpirationYear: process.env.TEST_CARD_EXP_YEAR ?? '30',
    cardExpirationMonth: process.env.TEST_CARD_EXP_MONTH ?? '12',
    cardPassword: process.env.TEST_CARD_PASSWORD ?? '12',
    customerIdentityNumber: process.env.TEST_CARD_BIRTH ?? '900101',
  }
  const res = await fetch('https://api.tosspayments.com/v1/billing/authorizations/card', {
    method: 'POST',
    headers: { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `빌링키 발급 실패 [${data.code ?? res.status}] ${data.message ?? ''}\n` +
        `  → 카드 직접입력 API 가 막혀 있으면 TEST_CARD_* 환경변수로 토스 개발자센터의 테스트 카드를 넣어 보세요.`,
    )
  }
  return data.billingKey as string
}

async function makeTenant(
  sb: SupabaseClient,
  name: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await sb
    .from('tenants')
    .insert({ name: `${TEST_PREFIX}${name}`, role: 'supplier', is_active: true, is_approved: true, ...fields })
    .select('id')
    .single()
  if (error) throw new Error(`테스트 테넌트 생성 실패(${name}): ${error.message}`)
  return (data as { id: string }).id
}

async function cleanup(sb: SupabaseClient) {
  const { data } = await sb.from('tenants').select('id').like('name', `${TEST_PREFIX}%`)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (!ids.length) return 0
  await sb.from('subscription_billing_attempts').delete().in('tenant_id', ids)
  await sb.from('coupon_uses').delete().in('tenant_id', ids)
  await sb.from('admin_logs').delete().in('tenant_id', ids)
  await sb.from('tenants').delete().in('id', ids)
  return ids.length
}

const day = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

async function main() {
  const env = loadEnv(resolve(process.cwd(), '.env.local'))
  const secretKey = env.TOSS_SECRET_KEY ?? process.env.TOSS_SECRET_KEY ?? ''

  if (!secretKey) throw new Error('.env.local 에 TOSS_SECRET_KEY 가 없습니다')
  if (!secretKey.startsWith('test_sk_')) {
    throw new Error(
      `안전장치: TOSS_SECRET_KEY 가 test_sk_ 로 시작하지 않습니다 (현재 접두사: ${secretKey.slice(0, 8)}…).\n` +
        '  운영 키로는 이 스크립트를 돌리지 않습니다. 테스트 키로 바꿔 주세요.',
    )
  }
  process.env.TOSS_SECRET_KEY = secretKey

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  /** 이 실행이 만든 로그만 지우기 위한 기준 시각 */
  const startedAt = new Date().toISOString()

  console.log('0) 이전 잔여물 정리')
  console.log(`   정리된 테넌트: ${await cleanup(sb)}개\n`)

  try {
    // --- 1) 빌링키 발급 -----------------------------------------------------
    console.log('1) 토스 테스트 키로 빌링키 발급')
    const customerKey = `renewal_test_${Date.now()}`
    const billingKey = await issueTestBillingKey(secretKey, customerKey)
    console.log(`   billingKey: ${billingKey.slice(0, 10)}… (len ${billingKey.length})\n`)

    // --- 2) 테스트 테넌트 ---------------------------------------------------
    console.log('2) 테스트 테넌트 생성')
    const now = new Date()
    const expiresSoon = new Date(now.getTime() + 60 * 1000) // 1분 뒤 만료

    const okId = await makeTenant(sb, 'ok', {
      subscription_plan: 'monthly',
      subscribed_at: now.toISOString(),
      plan_expires_at: expiresSoon.toISOString(),
      billing_key: billingKey,
      toss_customer_key: customerKey,
    })
    const badId = await makeTenant(sb, 'bad', {
      subscription_plan: 'monthly',
      subscribed_at: now.toISOString(),
      plan_expires_at: new Date(now.getTime() - 86400000).toISOString(),
      billing_key: 'INVALID_BILLING_KEY_FOR_TEST',
      toss_customer_key: `renewal_test_bad_${Date.now()}`,
    })
    const couponId = await makeTenant(sb, 'coupon', {
      subscription_plan: 'monthly',
      subscribed_at: now.toISOString(),
      plan_expires_at: new Date(now.getTime() - 86400000).toISOString(),
      billing_key: billingKey,
      toss_customer_key: customerKey,
    })
    // 쿠폰 무료기간 중인 테넌트 — coupon_uses 에 미래 만료일을 넣어 둔다
    {
      const { data: c, error } = await sb
        .from('coupons')
        .insert({ code: `${TEST_PREFIX}CODE_${Date.now()}`, plan: 'any', free_months: 2, max_uses: 5 })
        .select('id')
        .single()
      if (error) throw new Error(`테스트 쿠폰 생성 실패: ${error.message}`)
      await sb.from('coupon_uses').insert({
        coupon_id: (c as { id: string }).id,
        tenant_id: couponId,
        plan_expires_at: new Date(now.getTime() + 60 * 86400000).toISOString(),
      })
    }
    console.log(`   ok=${okId.slice(0, 8)} bad=${badId.slice(0, 8)} coupon=${couponId.slice(0, 8)}\n`)
    const testIds = [okId, badId, couponId]

    // --- 3) 만료 전에는 대상이 아니어야 한다 --------------------------------
    console.log('3) 만료 전 — 청구 대상에서 제외되는지')
    {
      const s = await runSubscriptionRenewal(sb, { dryRun: true, now, tenantIds: [okId] })
      check(s.candidates === 0, '만료 전 테넌트는 후보에 없음', { candidates: s.candidates })
    }

    // --- 4) 만료 후 실제 재청구 ---------------------------------------------
    console.log('\n4) 만료 1분 경과 후 실제 재청구')
    const afterExpiry = new Date(expiresSoon.getTime() + 60 * 1000)
    const before = await sb.from('tenants').select('plan_expires_at').eq('id', okId).single()
    const prevExpiry = (before.data as { plan_expires_at: string }).plan_expires_at

    const run1 = await runSubscriptionRenewal(sb, { now: afterExpiry, tenantIds: testIds })
    console.log(
      `   대상 ${run1.candidates} · 성공 ${run1.success} · 실패 ${run1.failed} · 제외 ${run1.skipped}`,
    )
    for (const r of run1.results) {
      console.log(`     - ${r.tenant_name}: ${r.outcome} ${r.reason ?? ''}`)
    }

    check(run1.success === 1, '정상 테넌트 1건 결제 성공', run1.results)
    check(run1.charged_amount === 99000, '청구 금액 99,000원', run1.charged_amount)
    check(
      run1.results.some((r) => r.tenant_id === couponId && r.outcome === 'skipped' && /무료기간/.test(r.reason ?? '')),
      '쿠폰 무료기간 테넌트는 제외',
      run1.results.find((r) => r.tenant_id === couponId),
    )
    check(
      run1.results.some((r) => r.tenant_id === badId && r.outcome === 'failed'),
      '잘못된 빌링키 테넌트는 실패 처리',
      run1.results.find((r) => r.tenant_id === badId),
    )

    // 만료일 연장 확인
    {
      const { data } = await sb
        .from('tenants')
        .select('plan_expires_at, billing_status, billing_failed_count')
        .eq('id', okId)
        .single()
      const row = data as { plan_expires_at: string; billing_status: string; billing_failed_count: number }
      const prevMs = new Date(prevExpiry).getTime()
      const nextMs = new Date(row.plan_expires_at).getTime()
      const diffDays = Math.round((nextMs - prevMs) / 86400000)
      console.log(`   만료일: ${prevExpiry.slice(0, 19)} → ${row.plan_expires_at.slice(0, 19)} (+${diffDays}일)`)
      check(nextMs > prevMs, '만료일이 연장됨', { prevExpiry, next: row.plan_expires_at })
      check(diffDays >= 28 && diffDays <= 31, '연장 폭이 1개월', { diffDays })
      check(row.billing_status === 'active', '성공 시 billing_status=active', row.billing_status)
      check(row.billing_failed_count === 0, '성공 시 실패 카운트 0', row.billing_failed_count)
    }

    // 이력 확인
    {
      const { data } = await sb
        .from('subscription_billing_attempts')
        .select('status, amount, order_id, payment_key, prev_expires_at, next_expires_at')
        .eq('tenant_id', okId)
      const rows = (data ?? []) as { status: string; payment_key: string | null }[]
      check(rows.length === 1 && rows[0].status === 'success', '시도 이력 1건 success', rows)
      check(Boolean(rows[0]?.payment_key), 'paymentKey 기록됨', rows[0]?.payment_key)
    }

    // 활동 기록 확인
    {
      const { data } = await sb
        .from('admin_logs')
        .select('action_type, reason')
        .in('tenant_id', testIds)
        .order('created_at', { ascending: false })
      const rows = (data ?? []) as { action_type: string; reason: string }[]
      const types = rows.map((r) => r.action_type)
      check(types.includes('subscription_renewal_success'), '활동기록: 성공 로그', types)
      check(types.includes('subscription_renewal_failed'), '활동기록: 실패 로그', types)
      const failLog = rows.find((r) => r.action_type === 'subscription_renewal_failed')
      console.log(`   실패 로그 사유: ${failLog?.reason}`)
      check(Boolean(failLog?.reason && failLog.reason.length > 10), '실패 사유가 로그에 담김', failLog?.reason)
    }

    // --- 5) 같은 날 중복 실행 차단 -------------------------------------------
    console.log('\n5) 같은 날 재실행 — 중복청구 차단')
    {
      const run2 = await runSubscriptionRenewal(sb, { now: afterExpiry, tenantIds: testIds })
      const okRes = run2.results.find((r) => r.tenant_id === okId)
      check(run2.success === 0, '두 번째 실행에서 추가 결제 없음', { success: run2.success })
      // ok 테넌트는 만료일이 미래로 밀려 후보에서 빠지는 게 정상. bad 는 후보로 남아 중복차단에 걸린다.
      const badRes = run2.results.find((r) => r.tenant_id === badId)
      check(
        Boolean(badRes && /이미 시도/.test(badRes.reason ?? '')),
        '같은 날 재시도는 중복청구 방지로 차단',
        badRes,
      )
      check(!okRes, '연장된 테넌트는 후보에서 빠짐', okRes)

      const { count } = await sb
        .from('subscription_billing_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', okId)
      check(count === 1, '결제 시도 이력이 여전히 1건 (이중청구 없음)', count)
    }

    // --- 6) 재시도 소진 정책 (하루씩 이동해 시뮬레이션) ----------------------
    console.log(`\n6) 실패 재시도 정책 — 매일 1회 × ${MAX_RETRY}일`)
    {
      const d2 = await runSubscriptionRenewal(sb, { now: day(afterExpiry, 1), tenantIds: [badId] })
      const r2 = d2.results.find((r) => r.tenant_id === badId)
      const { data: t2 } = await sb.from('tenants').select('billing_status, billing_failed_count').eq('id', badId).single()
      check(
        (t2 as { billing_status: string }).billing_status === 'retrying' &&
          (t2 as { billing_failed_count: number }).billing_failed_count === 2,
        '2회차 실패 → retrying(2)',
        t2,
      )
      check(!r2?.exhausted, '2회차는 아직 소진 아님', r2?.exhausted)

      const d3 = await runSubscriptionRenewal(sb, { now: day(afterExpiry, 2), tenantIds: [badId] })
      const r3 = d3.results.find((r) => r.tenant_id === badId)
      const { data: t3 } = await sb.from('tenants').select('billing_status, billing_failed_count').eq('id', badId).single()
      check(
        (t3 as { billing_status: string }).billing_status === 'failed' &&
          (t3 as { billing_failed_count: number }).billing_failed_count === MAX_RETRY,
        `${MAX_RETRY}회차 실패 → failed(${MAX_RETRY})`,
        t3,
      )
      check(Boolean(r3?.exhausted), '3회차에서 재시도 소진 표시', r3?.exhausted)
      check(d3.exhausted === 1, '요약에 재시도 소진 1건', d3.exhausted)

      const d4 = await runSubscriptionRenewal(sb, { now: day(afterExpiry, 3), tenantIds: [badId] })
      check(d4.candidates === 0, '4일째에는 후보에서 완전히 제외 (무한 재시도 없음)', d4.candidates)

      const { count } = await sb
        .from('subscription_billing_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', badId)
      check(count === MAX_RETRY, `실패 테넌트 시도 이력 ${MAX_RETRY}건에서 멈춤`, count)

      // 정지 정책: 표시만 — 강등/차단 없음
      const { data: t4 } = await sb
        .from('tenants')
        .select('subscription_plan, is_approved, is_active, billing_last_error')
        .eq('id', badId)
        .single()
      const row = t4 as { subscription_plan: string; is_approved: boolean; is_active: boolean; billing_last_error: string }
      check(row.subscription_plan === 'monthly', '자동 강등 없음 (plan 유지)', row.subscription_plan)
      check(row.is_approved === true && row.is_active === true, '서비스 차단 없음', row)
      check(Boolean(row.billing_last_error), '실패 사유가 tenants 에 표시됨', row.billing_last_error)

      const { data: exLog } = await sb
        .from('admin_logs')
        .select('action_type, reason')
        .eq('tenant_id', badId)
        .eq('action_type', 'subscription_renewal_exhausted')
      check(((exLog ?? []) as unknown[]).length === 1, '활동기록: 재시도 소진 로그', exLog)
      console.log(`   소진 로그: ${(exLog?.[0] as { reason: string } | undefined)?.reason}`)
    }

    // --- 7) 요약 로그 --------------------------------------------------------
    console.log('\n7) 관리자 화면(/admin/logs)에 남은 요약 로그')
    {
      const { data } = await sb
        .from('admin_logs')
        .select('action_type, reason, created_at')
        .eq('action_type', 'subscription_renewal_run')
        .order('created_at', { ascending: false })
        .limit(3)
      for (const r of (data ?? []) as { reason: string }[]) console.log(`   · ${r.reason}`)
      check(((data ?? []) as unknown[]).length > 0, '실행 요약 로그가 남음')
    }
  } finally {
    console.log('\n8) 정리')
    console.log(`   삭제된 테스트 테넌트: ${await cleanup(sb)}개`)
    await sb.from('coupons').delete().like('code', `${TEST_PREFIX}%`)
    // 요약 로그는 tenant_id 가 없어 위 정리에 안 걸린다. 이 실행이 만든 것(startedAt 이후)만 지운다.
    await sb
      .from('admin_logs')
      .delete()
      .eq('action_type', 'subscription_renewal_run')
      .gte('created_at', startedAt)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`결과: ${pass.length} PASS / ${fail.length} FAIL`)
  if (fail.length) {
    for (const f of fail) console.log(`  FAIL — ${f}`)
    process.exit(1)
  }
  console.log('전 과정 검증 통과')
}

main().catch((e) => {
  console.error('\n검증 중단:', e instanceof Error ? e.message : e)
  process.exit(1)
})
