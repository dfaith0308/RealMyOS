import { redirect } from 'next/navigation'

/** `/admin` 진입 — 대시보드로 이동 (루트 `/` 와 분리) */
export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
