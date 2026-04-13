/**
 * Server Action 반환값을 JSON-safe하게 직렬화
 * Map, Set, Date 객체, undefined, BigInt 등 직렬화 불가 타입 제거
 *
 * 사용: return serializeSafe(result)
 */
export function serializeSafe<T>(data: T): T {
  try {
    return JSON.parse(JSON.stringify(data, (_key, value) => {
      if (value === undefined)          return null
      if (typeof value === 'bigint')    return value.toString()
      if (value instanceof Map)         return Object.fromEntries(value)
      if (value instanceof Set)         return Array.from(value)
      // Date는 toISOString()이 자동 호출되므로 별도 처리 불필요
      return value
    }))
  } catch (e) {
    console.error('[serializeSafe] failed:', e)
    return data
  }
}