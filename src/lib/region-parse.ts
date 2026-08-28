/**
 * 주소 문자열 → 지역(시/도, 시/군/구) 파싱.
 *
 * 외부 API를 쓰지 않고 문자열 규칙만으로 추출한다. 도로명·지번 주소 모두
 * "시/도 + 시/군/구 + 나머지" 순서를 지키므로 앞 두 토큰만 보면 충분하다.
 * 확신이 서지 않는 입력은 억지로 넣지 않고 null을 돌려준다 (오탐보다 미탐이 낫다).
 */

export type ParsedRegion = {
  sido: string | null
  sigungu: string | null
}

/** 정식 명칭 → 흔히 쓰는 축약형들. 긴 별칭부터 매칭한다. */
const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ['서울특별시', '서울시', '서울'],
  부산광역시: ['부산광역시', '부산시', '부산'],
  대구광역시: ['대구광역시', '대구시', '대구'],
  인천광역시: ['인천광역시', '인천시', '인천'],
  광주광역시: ['광주광역시', '광주시', '광주'],
  대전광역시: ['대전광역시', '대전시', '대전'],
  울산광역시: ['울산광역시', '울산시', '울산'],
  세종특별자치시: ['세종특별자치시', '세종시', '세종'],
  경기도: ['경기도', '경기'],
  강원특별자치도: ['강원특별자치도', '강원도', '강원'],
  충청북도: ['충청북도', '충북'],
  충청남도: ['충청남도', '충남'],
  전북특별자치도: ['전북특별자치도', '전라북도', '전북'],
  전라남도: ['전라남도', '전남'],
  경상북도: ['경상북도', '경북'],
  경상남도: ['경상남도', '경남'],
  제주특별자치도: ['제주특별자치도', '제주도', '제주'],
}

/** [별칭, 정식명칭] 을 별칭 길이 내림차순으로 — '서울특별시'가 '서울'보다 먼저 걸리게. */
const SIDO_LOOKUP: Array<[string, string]> = Object.entries(SIDO_ALIASES)
  .flatMap(([canonical, aliases]) => aliases.map((a) => [a, canonical] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length)

/**
 * 시/군/구 단위로 볼 수 있는 토큰인지.
 * 한글만으로 이루어져야 한다 — '3번출구' 같은 지번/건물 표기가
 * '구'로 끝난다는 이유만으로 지역으로 잡히는 것을 막는다.
 */
function isDistrictToken(token: string): boolean {
  return /^[가-힣]{1,5}[시군구]$/.test(token)
}

function normalize(address: string): string {
  return (address ?? '').replace(/\s+/g, ' ').trim()
}

export function parseRegion(address: string | null | undefined): ParsedRegion {
  const normalized = normalize(address ?? '')
  if (!normalized) return { sido: null, sigungu: null }

  let sido: string | null = null
  let rest = normalized

  for (const [alias, canonical] of SIDO_LOOKUP) {
    if (!normalized.startsWith(alias)) continue
    // '서울시청역' 처럼 별칭 뒤에 글자가 이어붙는 오탐 방지 — 공백으로 끊겨야 한다.
    const after = normalized.slice(alias.length)
    if (after && !after.startsWith(' ')) continue
    sido = canonical
    rest = after.trim()
    break
  }

  // 세종은 시/도이자 기초자치단체라 하위 시군구가 없다.
  if (sido === '세종특별자치시') return { sido, sigungu: null }

  const tokens = rest.split(' ').filter(Boolean)
  let sigungu: string | null = null

  for (let i = 0; i < Math.min(tokens.length, 2); i++) {
    if (!isDistrictToken(tokens[i])) continue
    sigungu = tokens[i]
    // '성남시 분당구' 처럼 시 아래 일반구가 붙는 경우 함께 묶어야 영업 단위로 쓸모가 있다.
    const next = tokens[i + 1]
    if (/시$/.test(tokens[i]) && next && /구$/.test(next)) {
      sigungu = `${tokens[i]} ${next}`
    }
    break
  }

  return { sido, sigungu }
}

/** 목록 표시·필터용 단일 문자열. 예: '경기도 성남시 분당구' */
export function formatRegion(sido: string | null, sigungu: string | null): string {
  return [sido, sigungu].filter(Boolean).join(' ')
}

/** 필터 드롭다운에 쓸 시/도 정식명칭 목록 */
export const SIDO_OPTIONS: string[] = Object.keys(SIDO_ALIASES)
