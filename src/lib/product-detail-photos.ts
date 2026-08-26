import { readdirSync } from 'fs'
import { join } from 'path'

/** 상세이미지 상단에 무작위로 넣을 사진들이 놓이는 폴더 (public 하위) */
const PHOTO_DIR = join('public', 'product-detail-photos')
const IMAGE_EXT = /\.(jpe?g|png|webp|avif)$/i

/**
 * public/product-detail-photos/ 안의 이미지 파일 목록을 요청 시점에 읽어 공개 URL 배열로 돌려준다.
 * 서버 컴포넌트에서만 호출한다. 폴더가 없거나 비어 있으면 빈 배열을 돌려주므로,
 * 사진을 폴더에 넣기만 하면 코드 수정 없이 반영된다.
 */
export function getProductDetailPhotoUrls(): string[] {
  try {
    return readdirSync(join(process.cwd(), PHOTO_DIR))
      .filter((name) => IMAGE_EXT.test(name))
      .sort()
      .map((name) => `/product-detail-photos/${encodeURIComponent(name)}`)
  } catch {
    return []
  }
}
