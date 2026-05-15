import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f6f2' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        <div style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 32,
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
