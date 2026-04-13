/**
 * Server Action 반환값 JSON-safe 직렬화 유틸
 *
 * 역할: 직렬화 변환만 담당
 *   Map → plain object, Set → array,
 *   BigInt → number, undefined → null
 *   Date → ISO string (JSON.stringify가 자동 처리)
 *
 * 한계: catch에서 타입별 fallback 결정하지 않음
 *   → 각 함수가 자기 반환 타입에 맞는 fallback을 직접 반환해야 함
 *
 * 직렬화 자체가 실패한 경우(극히 드문 순환참조 등):
 *   → 원본 data를 그대로 반환 (타입 깨지는 것보다 나음)
 *   → 상위 catch가 안전한 fallback을 잡아야 함
 */
export function serializeSafe<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (value === undefined)       return null
      if (typeof value === 'bigint') return Number(value)
      if (value instanceof Map)      return Object.fromEntries(value)
      if (value instanceof Set)      return Array.from(value)
      return value
    })
  )
}