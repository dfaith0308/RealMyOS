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
  manufacturer?: string
}): Promise<{
  success: boolean
  strengths?: string
  usage?: string
  summary?: string
  error?: string
}> {
  const productName = String(input.productName ?? '').trim()
  if (!productName) {
    return { success: false, error: '상품명이 필요합니다' }
  }

  const brandName = String(input.brandName ?? '').trim()
  const spec = String(input.spec ?? '').trim()
  const ingredients = String(input.ingredients ?? '').trim()
  const usageDesc = String(input.usageDesc ?? '').trim()
  const manufacturer = String(input.manufacturer ?? '').trim()

  const prompt = `당신은 업소용 식자재 전문 MD입니다.
식당·업소에서 실제로 사용하는 관점으로 아래 상품을 분석해주세요.

분석 원칙:
- 국산/외국산 여부는 언급하지 않습니다
- MSG, 핵산계 향미증진제, 첨가물은 업소용 표준이므로 단점이 아닙니다
- 원재료명을 보고 실제 맛, 점도, 풍미, 조리 특성을 추론합니다
- 강점이 약한 상품도 반드시 분석 결과를 제시합니다
- "강점을 찾기 어렵다"는 표현 절대 금지

아래 형식으로 정확히 작성하세요 (구분자 포함):

[특징및강점]
원재료와 제조 방식을 바탕으로 제품의 맛 특성, 조리 편의성, 업소 활용 강점을 3~4문장으로 설명합니다.

[활용메뉴]
이 제품의 활용 용도를 아래 형식으로 작성합니다.
- 주요 용도를 2~3개 카테고리로 묶어서 설명
- 각 카테고리별로 구체적인 메뉴명을 예시로 포함
- 마지막에 활용 팁 한 문장 추가
- 형식: "~에 적합하며, ~에도 사용할 수 있다. 또한 ~."
- 원재료와 실제로 어울리는 메뉴만 작성
- 억지로 메뉴 수 채우지 말 것
- 3~4문장으로 작성

예시 형식:
"비빔냉면, 비빔국수, 막국수 등 면요리의 비빔장으로 적합하며, 골뱅이무침, 오이무침 등 무침요리에도 사용할 수 있다. 또한 제육무침, 족발무침 등 새콤달콤한 양념이 필요한 메뉴에도 활용하기 좋으며, 식초나 설탕을 추가하여 매장 스타일에 맞게 조절할 수 있다."

[한줄평]
사장님이 첫눈에 보고 바로 이해할 수 있는 한 문장. 형식: "~한 업소용 ~로, ~한 제품입니다."

상품 정보:
상품명: ${productName}
${brandName ? `브랜드: ${brandName}` : ''}
${spec ? `규격: ${spec}` : ''}
${ingredients ? `원재료명: ${ingredients}` : ''}
${usageDesc ? `용도: ${usageDesc}` : ''}
${manufacturer ? `제조원: ${manufacturer}` : ''}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    if (!text) return { success: false, error: '분석 결과가 비어 있습니다' }

    const strengthsMatch = text.match(/\[특징및강점\]([\s\S]*?)(?=\[활용메뉴\]|$)/)
    const usageMatch = text.match(/\[활용메뉴\]([\s\S]*?)(?=\[한줄평\]|$)/)
    const summaryMatch = text.match(/\[한줄평\]([\s\S]*?)$/)

    return {
      success: true,
      strengths: strengthsMatch?.[1]?.trim() ?? '',
      usage: usageMatch?.[1]?.trim() ?? '',
      summary: summaryMatch?.[1]?.trim() ?? '',
    }
  } catch {
    return { success: false, error: '분석 중 오류가 발생했습니다' }
  }
}
