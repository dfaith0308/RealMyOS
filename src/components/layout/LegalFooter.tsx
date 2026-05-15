'use client'

import Link from 'next/link'

export default function LegalFooter() {
  return (
    <footer
      style={{
        padding: '18px 16px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        background: '#fff',
        color: '#6b7280',
        fontSize: 12,
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/terms" style={{ color: '#374151', textDecoration: 'none', fontWeight: 600 }}>
          이용약관
        </Link>
        <span style={{ opacity: 0.6 }}>|</span>
        <Link href="/privacy" style={{ color: '#374151', textDecoration: 'none', fontWeight: 600 }}>
          개인정보처리방침
        </Link>
        <span style={{ opacity: 0.6 }}>|</span>
        <span>
          운영자: [상호명] · 대표: [대표자명] · 연락처: [연락처] · 이메일: [이메일]
        </span>
      </div>
      {/* TODO: 운영자 정보(상호/대표/연락처/이메일)를 실제 값으로 교체하세요. */}
    </footer>
  )
}

