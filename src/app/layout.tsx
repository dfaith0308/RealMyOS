import type { Metadata } from 'next'
import './globals.css'
import LegalFooter from '@/components/layout/LegalFooter'

export const metadata: Metadata = {
  title: 'RealMyOS',
  description: '식식이 ERP',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <LegalFooter />
      </body>
    </html>
  )
}
