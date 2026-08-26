/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    /**
     * public/ 은 정적 스토리지로만 올라가고 서버리스 함수 파일시스템에는 포함되지 않는다.
     * 상세이미지 상단 사진 목록은 요청 시점에 fs 로 이 폴더를 읽으므로(lib/product-detail-photos.ts)
     * 해당 라우트의 함수 번들에 폴더를 명시적으로 포함시킨다.
     */
    outputFileTracingIncludes: {
      '/admin/commerce/products/new': ['./public/product-detail-photos/**'],
      '/admin/commerce/products/[id]/edit': ['./public/product-detail-photos/**'],
    },
  },
}

module.exports = nextConfig
