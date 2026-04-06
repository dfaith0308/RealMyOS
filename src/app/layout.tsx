import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
