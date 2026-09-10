/**
 * 승인된 마이그레이션 1개만 적용한다 — 2026-09-02
 *   supabase/migrations/20260902100000_add_subscription_renewal.sql
 *
 * 사용:
 *   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # 이 셸에서만
 *   npx tsx scripts/apply-mig-subscription-renewal.ts
 *
 * 안전장치
 *  - 이 파일 하나만 읽는다. db push 처럼 밀린 마이그레이션을 몰아서 실행하지 않는다.
 *  - 파괴적 구문(DROP TABLE / TRUNCATE / DELETE / UPDATE / INSERT)이 섞이면 실행을 거부한다.
 *    ※ 이 마이그레이션의 DROP CONSTRAINT IF EXISTS 는 CHECK 재정의용이라 허용한다.
 *  - 토큰은 출력하지 않는다.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PROJECT_REF = 'cqiwcyuclpuarynrreat'
const MIGRATION = 'supabase/migrations/20260902100000_add_subscription_renewal.sql'

const ALLOWED = [
  /^ALTER TABLE [\w."]+\s+ADD COLUMN IF NOT EXISTS\b/is,
  /^ALTER TABLE [\w."]+\s+DROP CONSTRAINT IF EXISTS [\w.]+$/is,
  /^ALTER TABLE [\w."]+\s+ADD CONSTRAINT [\w.]+\s+CHECK\b/is,
  /^CREATE TABLE IF NOT EXISTS\b/is,
  /^CREATE (UNIQUE )?INDEX IF NOT EXISTS\b/is,
  /^COMMENT ON (COLUMN|TABLE)\b/is,
  /^ALTER TABLE [\w."]+\s+ENABLE ROW LEVEL SECURITY$/is,
]

/** 테이블/데이터를 날리는 구문이 섞였는지 본다. DROP CONSTRAINT 는 위 화이트리스트로만 통과. */
const FORBIDDEN = /\b(DROP\s+(TABLE|COLUMN|DATABASE|SCHEMA|INDEX)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\w|INSERT\s+INTO)\b/i

function statementsOf(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

function assertSafe(sql: string): number {
  const statements = statementsOf(sql)
  for (const st of statements) {
    if (FORBIDDEN.test(st)) {
      throw new Error(`파괴적 구문이라 중단합니다:\n${st.slice(0, 200)}`)
    }
    if (!ALLOWED.some((re) => re.test(st))) {
      throw new Error(`허용되지 않은 구문이라 중단합니다:\n${st.slice(0, 200)}`)
    }
  }
  return statements.length
}

async function runSql(token: string, query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL 실패 (${res.status}): ${text.slice(0, 500)}`)
  return text
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN 이 없습니다.')
    console.error('  PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."')
    process.exit(1)
  }

  const path = resolve(process.cwd(), MIGRATION)
  const sql = readFileSync(path, 'utf8')
  const n = assertSafe(sql)
  console.log(`검사 통과 — ${MIGRATION} (${n}개 구문)`)

  await runSql(token, sql)
  console.log('적용 완료.')

  // 적용 결과 확인
  const check = await runSql(
    token,
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='tenants'
        and column_name in ('billing_status','billing_failed_count','billing_last_attempt_at','billing_last_error')
      order by column_name;`,
  )
  console.log('tenants 신규 컬럼:', check)

  const tbl = await runSql(
    token,
    `select indexname from pg_indexes
      where schemaname='public' and tablename='subscription_billing_attempts'
      order by indexname;`,
  )
  console.log('subscription_billing_attempts 인덱스:', tbl)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
