import { redirect } from 'next/navigation'

// 상품 목록은 다음 단계에서 구현
export default function ProductsPage() {
  redirect('/products/new')
}
