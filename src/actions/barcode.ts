'use server'

import OpenAI from 'openai'
import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { lookupBarcodeChain } from '@/lib/barcode-lookup'
import type { BarcodeLookupParsed } from '@/lib/barcode-lookup'

export type BarcodeLookupResult = BarcodeLookupParsed & {
  ok: boolean
  error?: string
}

export type VisionProductHints = {
  name: string | null
  unit: string | null
  price_won: number | null
  barcode: string | null
  item_report_number: string | null
  manufacturer: string | null
  ingredients_text: string | null
  storage_method: string | null
  allergen: string | null
  origin: string | null
  raw_notes: string | null
}

const VISION_LABEL_PROMPT = `이 이미지는 식품 라벨 또는 상품정보고시입니다. 이미지에서 보이는 정보만 근거로 아래 JSON 형식 하나만 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.

{
  "name": "제품명 (예: 냉면비빔장)",
  "unit": "용량 또는 규격 (예: 2kg, 500ml)",
  "barcode": "바코드 숫자만 (예: 8809558031038)",
  "item_report_number": "품목보고번호 숫자 (예: 20100020501027)",
  "manufacturer": "제조원 회사명만 (예: ㈜해나음식품)",
  "ingredients_text": "원재료명 및 함량 전체 텍스트 그대로",
  "storage_method": "보관방법 텍스트 (예: 상온보관, 개봉 후 냉장보관)",
  "allergen": "알레르기 유발 성분 (예: 밀, 대두, 소고기, 닭고기 함유)",
  "origin": "원산지 정보 (예: 중국산, 국내산)",
  "price_won": null
}

규칙:
- 이미지에서 확인되지 않는 값은 반드시 null
- ingredients_text는 요약하지 말고 이미지의 원재료명 텍스트 전체를 그대로 복사
- manufacturer는 회사명만, 주소 제외
- barcode와 item_report_number는 숫자만`

async function resolveApiKeys(supabase: any, tenantId: string): Promise<{ foodSafety: string; nutrition: string }> {
  const { data: row } = await supabase
    .from('settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', 'foodsafety_api_key')
    .maybeSingle()

  const fromDb = String((row as { value?: string } | null)?.value ?? '').trim()
  const fromEnv = process.env.FOOD_SAFETY_API_KEY?.trim() ?? ''
  const foodSafety = fromDb || fromEnv
  // 동일 키를 영양 DB serviceKey로 재사용 (별도 키가 있으면 FOOD_NTR_API_KEY 우선)
  const nutrition = process.env.FOOD_NTR_API_KEY?.trim() || foodSafety
  return { foodSafety, nutrition }
}

/**
 * 바코드 조회: C005 → I2570 → (선택) 영양 DB
 * API 키: settings.foodsafety_api_key → FOOD_SAFETY_API_KEY (하드코딩 금지)
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false, error: '로그인 필요', ...emptyResult(barcode) }

  const raw = (barcode ?? '').replace(/\D/g, '')
  if (!raw || raw.length < 8) {
    return { ok: false, error: '바코드 숫자를 8자리 이상 입력해 주세요.', ...emptyResult(barcode) }
  }

  const { foodSafety, nutrition } = await resolveApiKeys(supabase, ctx.tenant_id)
  if (!foodSafety) {
    return {
      ok: false,
      error: '식품안전나라 API 키가 없습니다. 설정에 foodsafety_api_key를 저장하거나 FOOD_SAFETY_API_KEY 환경변수를 설정해 주세요.',
      ...emptyResult(raw),
    }
  }

  const parsed = await lookupBarcodeChain(foodSafety, nutrition, raw, { includeNutrition: true })
  if (!parsed.name && !parsed.item_report_number) {
    return {
      ok: false,
      error: '등록된 정보가 없습니다. 직접 입력해 주세요.',
      ...parsed,
      barcode: raw,
    }
  }

  return { ok: true, ...parsed, barcode: raw }
}

function emptyResult(barcode: string): BarcodeLookupParsed {
  const bc = (barcode ?? '').replace(/\D/g, '')
  return {
    name: null,
    manufacturer: null,
    category: null,
    item_report_number: null,
    unit: null,
    barcode: bc,
    ingredients_text: null,
    source: 'none',
  }
}

/**
 * 제품 라벨 사진 → Claude Vision (ANTHROPIC_API_KEY), 실패 시 GPT-4o-mini Vision fallback
 */
function parseVisionHintsFromResponseText(text: string): VisionProductHints | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return null
  }

  const name = parsed.name != null ? String(parsed.name).trim() || null : null
  const unit = parsed.unit != null ? String(parsed.unit).trim() || null : null
  const priceRaw = parsed.price_won
  const price_won =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw)
      ? Math.round(priceRaw)
      : typeof priceRaw === 'string' && /^\d+$/.test(priceRaw.trim())
        ? parseInt(priceRaw.trim(), 10)
        : null

  const barcodeVision =
    parsed.barcode != null ? String(parsed.barcode).replace(/\D/g, '') || null : null
  const item_report_number =
    parsed.item_report_number != null
      ? String(parsed.item_report_number).replace(/\D/g, '') || null
      : null
  const manufacturer = parsed.manufacturer != null ? String(parsed.manufacturer).trim() || null : null
  const ingredients_text =
    parsed.ingredients_text != null ? String(parsed.ingredients_text).trim() || null : null
  const storage_method =
    parsed.storage_method != null ? String(parsed.storage_method).trim() || null : null
  const allergen = parsed.allergen != null ? String(parsed.allergen).trim() || null : null
  const origin = parsed.origin != null ? String(parsed.origin).trim() || null : null

  return {
    name,
    unit,
    price_won,
    barcode: barcodeVision,
    item_report_number,
    manufacturer,
    ingredients_text,
    storage_method,
    allergen,
    origin,
    raw_notes: null,
  }
}

async function recognizeProductFromImageWithOpenAI(
  base64: string,
  mime: string,
): Promise<{ ok: boolean; data?: VisionProductHints; error?: string }> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return { ok: false, error: 'Vision 인식에 실패했습니다. API 키를 확인해 주세요.' }
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mime};base64,${base64}`,
              },
            },
            {
              type: 'text',
              text: VISION_LABEL_PROMPT,
            },
          ],
        },
      ],
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const data = parseVisionHintsFromResponseText(text)
    if (!data) return { ok: false, error: '이미지에서 정보를 읽지 못했습니다.' }
    return { ok: true, data }
  } catch {
    return { ok: false, error: '이미지에서 정보를 읽지 못했습니다.' }
  }
}

export async function recognizeProductFromImage(formData: FormData): Promise<{ ok: boolean; data?: VisionProductHints; error?: string }> {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)
  if (!ctx) return { ok: false, error: '로그인 필요' }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY가 설정되어 있지 않습니다.' }

  const file = formData.get('image')
  if (!file || !(file instanceof Blob) || file.size === 0) {
    return { ok: false, error: '이미지 파일을 선택해 주세요.' }
  }
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: '이미지는 4MB 이하만 지원합니다.' }

  const buf = Buffer.from(await file.arrayBuffer())
  const base64 = buf.toString('base64')
  const mime = (file as Blob).type && (file as Blob).type.startsWith('image/') ? (file as Blob).type : 'image/jpeg'

  const model = process.env.ANTHROPIC_VISION_MODEL?.trim() || 'claude-3-5-sonnet-20241022'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: base64 },
            },
            {
              type: 'text',
              text: VISION_LABEL_PROMPT,
            },
          ],
        },
      ],
    }),
  })

  if (res.ok) {
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = body.content?.find((c) => c.type === 'text')?.text ?? ''
    const data = parseVisionHintsFromResponseText(text)
    if (data) return { ok: true, data }
  }

  return recognizeProductFromImageWithOpenAI(base64, mime)
}
