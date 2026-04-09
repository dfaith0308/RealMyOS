export default function Loading() {
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
      {/* 타이틀 스켈레톤 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ width: 140, height: 24, background: '#f0f0f0', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
        <div style={{ width: 80, height: 32, background: '#f0f0f0', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
      </div>
      {/* KPI 또는 필터 스켈레톤 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ flex: 1, height: 64, background: '#f0f0f0', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
      {/* 테이블 스켈레톤 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f9fafb', padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ width: '100%', height: 14, background: '#e5e7eb', borderRadius: 4 }} />
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{ padding: '14px 16px', borderBottom: i < 6 ? '1px solid #f3f4f6' : 'none', display: 'flex', gap: 16 }}>
            <div style={{ flex: 2, height: 14, background: '#f0f0f0', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
      `}</style>
    </main>
  )
}
