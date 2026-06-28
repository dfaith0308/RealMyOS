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
