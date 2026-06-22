import BulkListingUploader from '@/components/commerce/BulkListingUploader'

export default function BulkListingPage() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>상품 대량 등록</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          엑셀 파일을 업로드해서 상품을 일괄 등록하거나 업데이트합니다
        </p>
      </div>
      <BulkListingUploader />
    </main>
  )
}
