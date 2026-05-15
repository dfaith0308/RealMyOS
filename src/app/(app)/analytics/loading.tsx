export default function AnalyticsLoading() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 60px' }}>
      <div style={{ height: 22, width: 140, background: '#f3f4f6', borderRadius: 6, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 32, width: 96, background: '#f3f4f6', borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ height: 60, background: '#f9fafb', borderRadius: 10, marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 84, background: '#f9fafb', borderRadius: 10 }} />
        ))}
      </div>
      <div style={{ height: 240, background: '#f9fafb', borderRadius: 10 }} />
    </main>
  )
}
