import Link from 'next/link'
import { getListingDetailTemplateLink } from '@/actions/admin/detail-templates'

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  marginTop: 24,
  background: '#fff',
}

/**
 * 상품 수정 화면 하단 — 이 상품(옵션)이 어느 상세페이지 템플릿에 연결돼 있는지만 보여준다.
 * 편집은 템플릿 화면에서 한다. 상세이미지 자동생성(ListingFormClient)은 건드리지 않는다.
 * 마이그레이션 전이면 조용히 안내만 한다.
 */
export default async function ListingDetailTemplateLinkPanel({ listingId }: { listingId: string }) {
  // 이 패널 때문에 기존 상품 수정 화면이 깨지면 안 된다
  const res = await getListingDetailTemplateLink(listingId).catch(() => ({
    success: false as const,
    error: '템플릿 정보를 불러오지 못했습니다',
    data: undefined,
  }))

  return (
    <section style={box}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>상세페이지 템플릿</h2>
      {!res.success ? (
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{res.error}</p>
      ) : res.data ? (
        <p style={{ fontSize: 13, margin: 0 }}>
          「{res.data.title}」 템플릿의 옵션으로 연결되어 있습니다{res.data.archived ? ' (보관된 템플릿 — 식당 화면에는 기존 상세가 보입니다)' : ''}.{' '}
          <Link href={`/admin/commerce/detail-templates/${res.data.template_id}`} style={{ color: '#1f5d3a', fontWeight: 600 }}>
            템플릿 열기
          </Link>
          <br />
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            이 화면의 상세 이미지·원산지·알레르기·보관방법·원재료명은 이 옵션의 자기 값으로 쓰이고, 비우면 템플릿 공통 값이 보입니다.
          </span>
        </p>
      ) : (
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          연결된 템플릿이 없습니다 — 식당 화면은 지금의 상세 화면 그대로입니다.{' '}
          <Link href="/admin/commerce/detail-templates" style={{ color: '#1f5d3a', fontWeight: 600 }}>
            템플릿 관리
          </Link>
        </p>
      )}
    </section>
  )
}
