import Link from 'next/link'
import { getAllAccounts, getAllAccountPurposes, getAllFundRules, getAccountPurposes, getFundPreview } from '@/actions/fund'
import FundSettingsClient from '@/components/fund/FundSettingsClient'

export const metadata = { title: '자금 설정 — RealMyOS' }

export default async function FundSettingsPage() {
  const [accountsResult, purposesResult, rulesResult, activePurposesResult, previewResult] = await Promise.all([
    getAllAccounts(),
    getAllAccountPurposes(),
    getAllFundRules(),
    getAccountPurposes(),
    getFundPreview(),
  ])

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/funds" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← 자금관리</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>자금 설정</h1>
      </div>

      <FundSettingsClient
        accounts={accountsResult.data ?? []}
        purposes={purposesResult.data ?? []}
        activePurposes={activePurposesResult.data ?? []}
        rules={rulesResult.data ?? []}
        preview={previewResult.data ?? null}
      />
    </main>
  )
}
