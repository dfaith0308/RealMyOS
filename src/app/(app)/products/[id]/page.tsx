import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getProductDetail,
  getProductCostHistory,
  getCustomerProductPrices,
  getProductRelatedManual,
  getProductUsagePattern,
  getProductAutoRecommend,
  getProductMarginAnalysis,
} from '@/actions/product'
import ProductDetailTabsClient from '@/components/product/ProductDetailTabsClient'

export const metadata = { title: '상품 상세 — RealMyOS' }

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const id = params.id

  const [
    detailRes,
    costRes,
    pricesRes,
    relatedRes,
    usageRes,
    autoRes,
    marginRes,
  ] = await Promise.all([
    getProductDetail(id),
    getProductCostHistory(id),
    getCustomerProductPrices(id),
    getProductRelatedManual(id),
    getProductUsagePattern(id),
    getProductAutoRecommend(id),
    getProductMarginAnalysis(id),
  ])

  if (!detailRes.success || !detailRes.data) notFound()

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ds-text-muted)', marginBottom: 6 }}>
            <Link href="/products" style={{ color: 'var(--ds-text-muted)', textDecoration: 'none' }}>상품</Link>
            {' / '}
            <span>상세</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>
            {detailRes.data.name}
            <span style={{ marginLeft: 10, fontFamily: 'monospace', fontSize: 12, fontWeight: 900, color: 'var(--ds-text-muted)' }}>
              {detailRes.data.product_code}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={`/products/${id}/edit`}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#374151', textDecoration: 'none' }}
          >
            수정
          </Link>
        </div>
      </div>

      <ProductDetailTabsClient
        product={detailRes.data}
        costHistory={costRes.data ?? []}
        customerPrices={pricesRes.data ?? []}
        manualRelated={relatedRes.data ?? []}
        usage={usageRes.data ?? null}
        autoRecommend={autoRes.data ?? null}
        margin={marginRes.data ?? null}
      />
    </main>
  )
}

