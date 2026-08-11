'use client'

import Link from 'next/link'

export default function LegalFooter() {
  const year = new Date().getFullYear()

  return (
    <footer
      style={{
        padding: '20px 16px',
        borderTop: '1px solid #e5e7eb',
        background: 'var(--ds-surface-canvas, #f7f6f2)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.85 }}>
        <p style={{ margin: '0 0 10px' }}>
          <Link href="/terms" style={{ color: '#4b5563', textDecoration: 'none', marginRight: 12 }}>
            이용약관
          </Link>
          <Link href="/privacy" style={{ color: '#4b5563', textDecoration: 'none' }}>
            개인정보처리방침
          </Link>
        </p>
        <p style={{ margin: 0 }}>
          상호명: 디닷페이스 · 대표자: 김정무 · 사업자등록번호: 728-02-02513 · 통신판매업 신고번호: 제2026-인천부평-0405호
        </p>
        <p style={{ margin: 0 }}>
          주소: 인천광역시 부평구 장제로155번길 24, 1층 · 이메일: dfaith0308@gmail.com · 전화번호: 032-215-3207
        </p>
        <p style={{ margin: '10px 0 0' }}>© {year} D.FAITH. All rights reserved.</p>
      </div>
    </footer>
  )
}
