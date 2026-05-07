import CustomerCreateForm from '@/components/customer/CustomerCreateForm'

export const metadata = { title: '거래처 등록 — RealMyOS' }

export default async function CustomerNewPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8f9fa', paddingTop: 32 }}>
      <CustomerCreateForm />
    </main>
  )
}
