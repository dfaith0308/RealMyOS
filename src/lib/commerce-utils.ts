export function buildPlatformProductDisplayName(
  brand_name: string | null,
  product_name: string,
  spec: string | null,
): string {
  const parts: string[] = []
  const b = brand_name?.trim()
  const n = product_name.trim()
  const sp = spec?.trim()
  const nLower = n.toLowerCase()
  if (b && !nLower.includes(b.toLowerCase())) parts.push(b)
  parts.push(n)
  if (sp && !nLower.includes(sp.toLowerCase())) parts.push(sp)
  return parts.join(' ')
}

/** products.name(조합 표시명)에서 brand/spec를 제거해 순수 상품명 추출 */
export function extractRawProductNameFromDisplay(
  displayName: string,
  brand_name: string | null,
  spec: string | null,
): string {
  let n = displayName.trim()
  if (!n) return ''
  const b = brand_name?.trim()
  const sp = spec?.trim()
  if (b && n.toLowerCase().startsWith(b.toLowerCase())) {
    n = n.slice(b.length).trim()
  }
  if (sp && n.toLowerCase().endsWith(sp.toLowerCase())) {
    n = n.slice(0, -sp.length).trim()
  }
  return n || displayName.trim()
}

/** 미리보기·상세이미지용 순수 상품명 (brand/spec 제거) */
export const extractPureProductName = extractRawProductNameFromDisplay
