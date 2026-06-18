'use server'

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function analyzeProductStrengths(input: {
  productName: string
  brandName?: string
  spec?: string
  ingredients?: string
  origin?: string
  usageDesc?: string
}): Promise<{ success: boolean; strengths?: string; error?: string }> {
  if (!input.ingredients && !input.origin && !input.usageDesc) {
    return { success: false, error: '분석할 정보가 없습니다' }
  }

  const prompt = `
당신은 B2B 식자재 전문가입니다. 아래 식자재 정보를 분석해서 식당 사장님에게 어필할 수 있는 핵심 강점 3가지를 한 줄씩 뽑아주세요.

상품명: ${input.productName}
${input.brandName ? `브랜드: ${input.brandName}` : ''}
${input.spec ? `규격: ${input.spec}` : ''}
${input.origin ? `원산지: ${input.origin}` : ''}
${input.ingredients ? `원재료명/함량: ${input.ingredients}` : ''}
${input.usageDesc ? `용도: ${input.usageDesc}` : ''}

조건:
- 식당 사장님 관점에서 실제로 도움이 되는 강점만
- 과장 없이 사실 기반
- 각 강점은 15자 이내
- 번호 없이 줄바꿈으로만 구분
- 예시: 국산 대두 95% 사용\n전통 방식 18개월 숙성\n찌개·국물요리 전용
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const strengths = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    return { success: true, strengths }
  } catch {
    return { success: false, error: '분석 중 오류가 발생했습니다' }
  }
}
