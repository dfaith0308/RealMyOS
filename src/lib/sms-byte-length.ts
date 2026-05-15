/** SMS 바이트 길이 — `'use server'` 모듈에서 분리 (클라이언트에서도 사용). */

export function smsByteLength(text: string): number {
  // PRODUCT 확정: 한글 1자=2바이트 / 영문 1자=1바이트 (근사 규칙)
  // 구현: ASCII(0x00~0x7F)=1, 그 외=2
  let sum = 0
  for (const ch of text ?? '') {
    const code = ch.codePointAt(0) ?? 0
    sum += code <= 0x7f ? 1 : 2
  }
  return sum
}
