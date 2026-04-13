/**
 * Server Action 반환값 JSON-safe 직렬화 유틸
 *
 * Next.js Server Component → Client 직렬화 규칙:
 *   Map, Set, Date, BigInt, undefined, class instance → 직렬화 실패
 *
 * 이 함수를 통과한 값은 JSON 왕복이 안전하게 보장됨.
 */
export function serializeSafe<T>(data: T): T {
  try {
    return JSON.parse(
      JSON.stringify(data, (_key, value) => {
        if (value === undefined)       return null
        if (value === null)            return null
        if (typeof value === 'bigint') return Number(value)
        if (value instanceof Map)      return Object.fromEntries(value)
        if (value instanceof Set)      return Array.from(value)
        // Date: JSON.stringify가 .toJSON() 자동 호출 → ISO string 변환됨
        return value
      })
    )
  } catch (e) {
    // 직렬화 자체가 실패한 경우 — null-safe 빈 값 반환
    console.error('[serializeSafe] serialization failed:', e)
    if (Array.isArray(data)) return [] as unknown as T
    if (data && typeof data === 'object') return {} as unknown as T
    return data
  }
}