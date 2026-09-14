// PGlite 하네스 — 운영 DB 없이 realmyos 마이그레이션 파일을 실제 Postgres(WASM)에 적용한다.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// 레포 안(scripts/transfer-verification)에서 돌면 ../../ 가 realmyos 루트다
export const REALMYOS_DIR = process.env.REALMYOS_DIR ?? resolve(HERE, '../..')
export const RESTAURANT_OS_DIR = process.env.RESTAURANT_OS_DIR ?? resolve(REALMYOS_DIR, '../🧑‍🍳resturant_os')
export const MIG = join(REALMYOS_DIR, 'supabase/migrations')

const PREREQ = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, role text, deleted_at timestamptz, subscription_plan text);
CREATE TABLE public.users (id uuid PRIMARY KEY, tenant_id uuid, role text, email text);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text);
CREATE TABLE public.product_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
`

export async function makeDb(extraMigrations = []) {
  const db = new PGlite()
  await db.exec(PREREQ)
  const base = [
    '20260807120007_record_is_admin.sql',
    '20260807120005_record_get_my_tenant_id.sql',
    '20260506130001_create_admin_logs.sql',
    '20260508010000_add_admin_logs_columns.sql',
    '20260509010000_create_commerce_tables.sql',
    '20260509020000_add_commerce_orders_columns.sql',
    '20260509030000_add_commerce_listings_image.sql',
    '20260510110000_add_listing_original_price.sql',
    '20260510120000_add_listing_brand_shipping.sql',
    '20260510140000_add_listing_admin_memo.sql',
    '20260514200000_commerce_orders_idempotency.sql',
    '20260515200000_create_commerce_order_allocations.sql',
    '20260617100000_add_shipping_policy_to_listings.sql',
    '20260617200000_add_product_detail_fields.sql',
    '20260618100000_add_ingredients_to_listings.sql',
    '20260618120000_add_manufacturer_to_listings.sql',
  ]
  for (const f of [...base, ...extraMigrations]) {
    const sql = readFileSync(join(MIG, f), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`migration failed: ${f}: ${e.message}`)
    }
  }
  return db
}

let failures = 0
let passes = 0
export function check(name, cond, detail) {
  if (cond) { passes++; console.log(`  PASS  ${name}`) }
  else { failures++; console.log(`  FAIL  ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''}`) }
}
export async function expectError(name, fn, pattern) {
  try { await fn(); failures++; console.log(`  FAIL  ${name} :: no error`) }
  catch (e) {
    const ok = pattern ? pattern.test(e.message) : true
    if (ok) { passes++; console.log(`  PASS  ${name} (${e.message.slice(0, 80)})`) }
    else { failures++; console.log(`  FAIL  ${name} :: ${e.message}`) }
  }
}
export function summary() {
  console.log(`\n== ${passes} passed, ${failures} failed`)
  if (failures) process.exitCode = 1
}
