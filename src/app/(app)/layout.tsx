import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
