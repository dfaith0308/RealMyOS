import { createSupabaseServer, getAuthCtx } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/layout/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const ctx = await getAuthCtx(supabase)

  if (!ctx || ctx.role !== 'admin') redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

