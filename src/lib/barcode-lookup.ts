/**
 * 식품안전나라 OpenAPI + 공공데이터포털 영양 DB 조회 (순수 fetch, 키는 호출측에서 주입)
 */

const FOOD_SAFETY_OPENAPI = 'https://openapi.foodsafetykorea.go.kr/api'
const DEFAULT_TIMEOUT_MS = 5000

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; json?: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return { ok: false }
    const json = await res.json().catch(() => null)
    if (json == null) return { ok: false }
    return { ok: true, json }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

export type BarcodeLookupParsed = {
  name: string | null
  manufacturer: string | null
  category: string | null
  item_report_number: string | null
  unit: string | null
  barcode: string
  ingredients_text: string | null
  source: 'c005' | 'i2570' | 'nutrition_db' | 'none'
}

function normBarcode(raw: string): string {
  return (raw ?? '').replace(/\D/g, '')
}

function asRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return []
  const row = (payload as Record<string, unknown>).row
  if (row == null) return []
  if (Array.isArray(row)) return row.filter((r) => r && typeof r === 'object') as Record<string, unknown>[]
  if (typeof row === 'object') return [row as Record<string, unknown>]
  return []
}

function firstStr(row: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!row) return null
  for (const k of keys) {
    const v = row[k] ?? row[k.toUpperCase()] ?? row[k.toLowerCase()]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

function parseC005(body: unknown, barcode: string): BarcodeLookupParsed | null {
  const root = body as Record<string, unknown> | null
  const block = root?.C005 ?? root?.c005
  if (!block || typeof block !== 'object') return null
  const rows = asRows(block)
  if (rows.length === 0) return null
  const r = rows[0] as Record<string, unknown>
  const name = firstStr(r, ['PRDLST_NM', 'PRDLST_NM_KOR', 'PRDUCT_NM'])
  const manufacturer = firstStr(r, ['BSSH_NM', 'MANUF_NM', 'MNFUR_NM'])
  const category = firstStr(r, ['PRDLST_DCNM', 'PRDLST_DC', 'CTGRY_NM'])
  const item_report_number = firstStr(r, ['PRDLST_REPORT_NO', 'PRDLST_REPORT_NO_', 'ITEM_REPORT_NO'])
  if (!name && !item_report_number) return null
  return {
    name,
    manufacturer,
    category,
    item_report_number,
    unit: null,
    barcode,
    ingredients_text: null,
    source: 'c005',
  }
}

function parseI2570(body: unknown, barcode: string): BarcodeLookupParsed | null {
  const root = body as Record<string, unknown> | null
  const block = root?.I2570 ?? root?.i2570
  if (!block || typeof block !== 'object') return null
  const rows = asRows(block)
  if (rows.length === 0) return null
  const r = rows[0] as Record<string, unknown>
  const name = firstStr(r, ['PRDLST_NM', 'PRDUCT_NM', 'PRDLST_NM_KOR'])
  const manufacturer = firstStr(r, ['BSSH_NM', 'CMPNY_NM', 'CNTRY_NM'])
  const category = firstStr(r, [
    'PRDLST_CL_LARGE_NM',
    'PRDLST_CL_MIDDLE_NM',
    'PRDLST_CL_SMALL_NM',
    'CTGRY_NM',
  ])
  const item_report_number = firstStr(r, ['PRDLST_REPORT_NO', 'ITEM_REPORT_NO'])
  if (!name && !item_report_number) return null
  return {
    name,
    manufacturer,
    category,
    item_report_number,
    unit: null,
    barcode,
    ingredients_text: null,
    source: 'i2570',
  }
}

/** C005 바코드연계제품정보 */
export async function fetchFoodSafetyC005(apiKey: string, barcode: string): Promise<BarcodeLookupParsed | null> {
  const bc = normBarcode(barcode)
  if (!bc || !apiKey.trim()) return null
  const key = encodeURIComponent(apiKey.trim())
  const url = `${FOOD_SAFETY_OPENAPI}/${key}/C005/json/1/5/BAR_CD=${encodeURIComponent(bc)}`
  const out = await fetchJsonWithTimeout(url, DEFAULT_TIMEOUT_MS)
  if (!out.ok) return null
  return parseC005(out.json, bc)
}

/** I2570 유통바코드 */
export async function fetchFoodSafetyI2570(apiKey: string, barcode: string): Promise<BarcodeLookupParsed | null> {
  const bc = normBarcode(barcode)
  if (!bc || !apiKey.trim()) return null
  const key = encodeURIComponent(apiKey.trim())
  const url = `${FOOD_SAFETY_OPENAPI}/${key}/I2570/json/1/5/BAR_CD=${encodeURIComponent(bc)}`
  const out = await fetchJsonWithTimeout(url, DEFAULT_TIMEOUT_MS)
  if (!out.ok) return null
  return parseI2570(out.json, bc)
}

function nutritionRowToText(row: Record<string, unknown>): string | null {
  const parts: string[] = []
  const name = firstStr(row, ['FOOD_NM_KR', 'FOOD_NM', 'DESC_KOR'])
  if (name) parts.push(`식품명: ${name}`)
  const maker = firstStr(row, ['MAKER_NM', 'MFR_NM'])
  if (maker) parts.push(`제조사: ${maker}`)
  const cat = firstStr(row, ['FOOD_CAT1_NM', 'DB_CLASS_NM'])
  if (cat) parts.push(`분류: ${cat}`)
  const energy = firstStr(row, ['ENERGY', 'KCAL', 'CALORIE'])
  if (energy) parts.push(`에너지: ${energy}`)
  const protein = firstStr(row, ['PROTEIN', 'PROT'])
  if (protein) parts.push(`단백질: ${protein}`)
  const fat = firstStr(row, ['FAT', 'LIPID'])
  if (fat) parts.push(`지방: ${fat}`)
  const carb = firstStr(row, ['CARBOHYDRATE', 'CHOCDF', 'CARB'])
  if (carb) parts.push(`탄수화물: ${carb}`)
  const sodium = firstStr(row, ['SODIUM', 'NA'])
  if (sodium) parts.push(`나트륨: ${sodium}`)
  return parts.length ? parts.join('\n') : null
}

/** 식품영양성분DB (공공데이터) — 품목명 또는 품목보고번호로 보조 조회 */
export async function fetchFoodNutritionDb(
  serviceKey: string,
  opts: { foodName?: string | null; itemReportNo?: string | null },
): Promise<string | null> {
  const key = (serviceKey ?? '').trim()
  if (!key) return null
  const name = (opts.foodName ?? '').trim()
  const report = (opts.itemReportNo ?? '').trim()
  if (!name && !report) return null

  const url = new URL('https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02')
  url.searchParams.set('serviceKey', key)
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('numOfRows', '3')
  url.searchParams.set('type', 'json')
  if (name) url.searchParams.set('FOOD_NM_KR', name)
  if (report) url.searchParams.set('ITEM_REPORT_NO', report)

  const out = await fetchJsonWithTimeout(url.toString(), DEFAULT_TIMEOUT_MS)
  if (!out.ok) return null
  const json = out.json
  const body = json as Record<string, unknown>
  const resp = body?.response as Record<string, unknown> | undefined
  const items = resp?.body as Record<string, unknown> | undefined
  const itemArr = items?.items
  let rows: Record<string, unknown>[] = []
  if (itemArr && typeof itemArr === 'object' && 'item' in (itemArr as object)) {
    const it = (itemArr as Record<string, unknown>).item
    if (Array.isArray(it)) rows = it as Record<string, unknown>[]
    else if (it && typeof it === 'object') rows = [it as Record<string, unknown>]
  }
  if (rows.length === 0) return null
  return nutritionRowToText(rows[0])
}

export async function lookupBarcodeChain(
  apiKey: string,
  nutritionServiceKey: string,
  barcode: string,
  opts?: { includeNutrition?: boolean },
): Promise<BarcodeLookupParsed> {
  const bc = normBarcode(barcode)
  const empty: BarcodeLookupParsed = {
    name: null,
    manufacturer: null,
    category: null,
    item_report_number: null,
    unit: null,
    barcode: bc,
    ingredients_text: null,
    source: 'none',
  }
  if (!bc) return empty

  let base =
    (await fetchFoodSafetyC005(apiKey, bc)) ??
    (await fetchFoodSafetyI2570(apiKey, bc))

  if (!base) return empty

  let ingredients_text = base.ingredients_text
  const wantNutrition = opts?.includeNutrition !== false
  if (wantNutrition && nutritionServiceKey.trim()) {
    const nut = await fetchFoodNutritionDb(nutritionServiceKey, {
      foodName: base.name,
      itemReportNo: base.item_report_number,
    })
    if (nut) {
      ingredients_text = ingredients_text ? `${ingredients_text}\n\n${nut}` : nut
      return { ...base, ingredients_text, source: 'nutrition_db' }
    }
  }

  return { ...base, ingredients_text }
}
