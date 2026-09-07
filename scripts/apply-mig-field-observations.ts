/**
 * 승인된 마이그레이션 1개만 적용한다 — 2026-09-07
 *   supabase/migrations/20260907100000_create_field_observations.sql
 *
 * 사용:
 *   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # 이 셸에서만
 *   npx tsx scripts/apply-mig-field-observations.ts
 *
 * 안전장치
 *  - 이 파일 하나만 읽는다. db push 처럼 밀린 마이그레이션을 몰아서 실행하지 않는다.
 *  - 파괴적 구문(DROP TABLE/COLUMN/SCHEMA, TRUNCATE, DELETE FROM)이 섞이면 실행을 거부한다.
 *  - 함수 본문($function$ … $function$)은 검사에서 떼어낸다. 본문 안의 INSERT/UPDATE 는
 *    RPC 로직이지 마이그레이션이 실행하는 DML 이 아니기 때문이다.
 *  - 본문을 뗀 나머지 구문은 화이트리스트에 있는 형태만 통과한다.
 *  - 토큰은 출력하지 않는다.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PROJECT_REF = 'cqiwcyuclpuarynrreat'
const MIGRATION = 'supabase/migrations/20260907100000_create_field_observations.sql'

const ALLOWED = [
  /^CREATE TABLE IF NOT EXISTS public\.field_observations\b/is,
  /^CREATE INDEX IF NOT EXISTS idx_field_observations_\w+\b/is,
  /^ALTER TABLE public\.field_observations\s+ENABLE ROW LEVEL SECURITY$/is,
  /^DROP POLICY IF EXISTS field_observations_admin_all ON public\.field_observations$/is,
  /^CREATE POLICY field_observations_admin_all ON public\.field_observations\b/is,
  /^ALTER TABLE public\.sales_lead_notes\s+ADD COLUMN IF NOT EXISTS photo_urls\b/is,
  /^CREATE OR REPLACE FUNCTION public\.apply_field_observation_actions\b/is,
  /^COMMENT ON (TABLE|COLUMN|FUNCTION)\b/is,
]

/** 테이블/데이터를 날리는 구문. 함수 본문을 떼어낸 뒤에 본다. */
const FORBIDDEN =
  /\b(DROP\s+(TABLE|COLUMN|DATABASE|SCHEMA|INDEX|FUNCTION)|TRUNCATE|DELETE\s+FROM|GRANT|REVOKE)\b/i

const FN_BODY = /\$function\$[\s\S]*?\$function\$/g

function statementsOf(sql: string): string[] {
  return sql
    // 함수 본문은 통째로 자리표시자로 바꾼다 — 세미콜론 분리와 금지어 검사에서 모두 제외
    .replace(FN_BODY, '$function$__BODY__$function$')
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
  if (!res.ok) throw new Error(`SQL 실패 (${res.status}): ${text.slice(0, 800)}`)
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

  // 새 RPC 를 PostgREST 가 바로 알아보게 스키마 캐시를 갱신한다
  await runSql(token, `NOTIFY pgrst, 'reload schema';`)

  const cols = await runSql(
    token,
    `select column_name, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name='field_observations'
      order by ordinal_position;`,
  )
  console.log('field_observations 컬럼:', cols)

  const noteCol = await runSql(
    token,
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='sales_lead_notes' and column_name='photo_urls';`,
  )
  console.log('sales_lead_notes.photo_urls:', noteCol)

  const pol = await runSql(
    token,
    `select policyname from pg_policies
      where schemaname='public' and tablename='field_observations';`,
  )
  console.log('RLS 정책:', pol)

  const fn = await runSql(
    token,
    `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='apply_field_observation_actions';`,
  )
  console.log('RPC:', fn)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
