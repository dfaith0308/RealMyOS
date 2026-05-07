'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  getAdminSettingHistory,
  sendPolicyConsoleAligoTest,
  updateAdminSetting,
  type AdminSettingHistoryRow,
  type GroupedPolicySettings,
  type PolicySettingItem,
} from '@/actions/admin/policy-console'

const SHORT_LABEL: Record<string, string> = {
  platform_fee_rate: '플랫폼 수수료율',
  settlement_cycle_days: '정산 주기',
  trust_supplier_level1: '공급자 Level 1 경계',
  trust_supplier_level2: '공급자 Level 2 경계',
  trust_supplier_level3: '공급자 Level 3 경계',
  trust_restaurant_level1: '식당 Level 1 경계',
  trust_restaurant_level2: '식당 Level 2 경계',
  trust_restaurant_level3: '식당 Level 3 경계',
  order_cycle_calculation_count: '주문 주기 계산 건수',
  signal_suppression_days: '신호 억제 기간',
  rfq_repeat_limit: 'RFQ 반복 제한',
  delivery_signal_window: '납기 신호 윈도우',
  rfq_open_duration_hours: '입찰 공개 시간',
  aligo_user_id: '알리고 사용자 ID',
  aligo_api_key: '알리고 API Key',
  aligo_sender: '알리고 발신번호',
}

function maskValue(key: string, value: string) {
  if (key === 'aligo_api_key' && value.length > 0) return '•'.repeat(Math.min(24, value.length)) + (value.length > 24 ? '…' : '')
  return value || '—'
}

export default function PolicyConsoleClient({ initial }: { initial: GroupedPolicySettings }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [editKey, setEditKey] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const [applyOpen, setApplyOpen] = useState(false)
  const [applyPayload, setApplyPayload] = useState<{ key: string; value: string } | null>(null)
  const [applyErr, setApplyErr] = useState<string | null>(null)

  const [histOpen, setHistOpen] = useState(false)
  const [histKey, setHistKey] = useState<string | null>(null)
  const [histRows, setHistRows] = useState<AdminSettingHistoryRow[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histErr, setHistErr] = useState<string | null>(null)

  const [testMsg, setTestMsg] = useState<string | null>(null)

  function startEdit(item: PolicySettingItem) {
    setEditKey(item.key)
    setEditDraft(item.value)
  }

  function cancelEdit() {
    setEditKey(null)
    setEditDraft('')
  }

  function requestApply() {
    if (!editKey) return
    setApplyPayload({ key: editKey, value: editDraft })
    setApplyErr(null)
    setApplyOpen(true)
  }

  function confirmApply() {
    if (!applyPayload) return
    setApplyErr(null)
    startTransition(async () => {
      const r = await updateAdminSetting(applyPayload.key, applyPayload.value)
      if (!r.success) {
        setApplyErr(r.error ?? '저장 실패')
        return
      }
      setApplyOpen(false)
      setApplyPayload(null)
      cancelEdit()
      router.refresh()
    })
  }

  async function openHistory(key: string) {
    setHistKey(key)
    setHistOpen(true)
    setHistErr(null)
    setHistLoading(true)
    setHistRows([])
    const r = await getAdminSettingHistory(key)
    setHistLoading(false)
    if (!r.success || !r.data) {
      setHistErr(r.error ?? '이력 조회 실패')
      return
    }
    setHistRows(r.data)
  }

  function sendTest() {
    setTestMsg(null)
    startTransition(async () => {
      const r = await sendPolicyConsoleAligoTest()
      setTestMsg(r.success ? r.data?.detail ?? '테스트 완료' : r.error ?? '실패')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PolicySection title="1. 수수료 정책">
        <PolicyRows
          items={initial.fee}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      <PolicySection title="2. 신뢰도 임계값 (공급자)">
        <PolicyRows
          items={initial.trust_supplier}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      <PolicySection title="2. 신뢰도 임계값 (식당)">
        <PolicyRows
          items={initial.trust_restaurant}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      <PolicySection title="3. 영업 정책">
        <PolicyRows
          items={initial.sales}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      <PolicySection title="4. 발주 정책">
        <PolicyRows
          items={initial.order}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      <PolicySection title="5. 알림 설정 (알리고)">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btnSecondary} disabled={pending} onClick={sendTest}>
            테스트 발송
          </button>
          {testMsg && <span style={{ fontSize: 13, color: '#374151' }}>{testMsg}</span>}
        </div>
        <PolicyRows
          items={initial.notify}
          editKey={editKey}
          editDraft={editDraft}
          pending={pending}
          onDraftChange={setEditDraft}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={requestApply}
          onHistory={openHistory}
        />
      </PolicySection>

      {applyOpen && applyPayload && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>정책 적용 확인</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.55 }}>
              이 값을 변경하면 <strong>즉시 적용</strong>됩니다. (캐시 없음)
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6b7280' }}>
              키: <code>{applyPayload.key}</code>
            </p>
            <pre
              style={{
                margin: '12px 0 0',
                padding: 10,
                background: '#f9fafb',
                borderRadius: 8,
                fontSize: 13,
                overflow: 'auto',
                maxHeight: 120,
              }}
            >
              {applyPayload.value || '(빈 값)'}
            </pre>
            {applyErr && (
              <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, marginTop: 12 }} role="alert">
                {applyErr}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" style={btnGhost} disabled={pending} onClick={() => setApplyOpen(false)}>
                취소
              </button>
              <button type="button" style={btnPrimary} disabled={pending} onClick={confirmApply}>
                {pending ? '저장 중…' : '확인 후 적용'}
              </button>
            </div>
          </div>
        </div>
      )}

      {histOpen && (
        <div style={overlay}>
          <div style={{ ...modal, width: 'min(560px, 100%)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 900 }}>변경 이력</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              키: <code>{histKey}</code>
            </p>
            {histLoading && <p style={{ marginTop: 12, fontSize: 13 }}>불러오는 중…</p>}
            {histErr && (
              <p style={{ color: '#DC2626', marginTop: 12, fontSize: 13 }} role="alert">
                {histErr}
              </p>
            )}
            {!histLoading && !histErr && histRows.length === 0 && (
              <p style={{ marginTop: 12, fontSize: 13, color: '#9ca3af' }}>이력이 없습니다.</p>
            )}
            {!histLoading && histRows.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['일시', '이전', '이후', '변경자'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histRows.map((r) => (
                      <tr key={r.id}>
                        <td style={td}>{String(r.created_at).slice(0, 19).replace('T', ' ')}</td>
                        <td style={td}>{r.before_value ?? '—'}</td>
                        <td style={td}>{r.after_value ?? '—'}</td>
                        <td style={td}>{r.admin_id ? `${String(r.admin_id).slice(0, 8)}…` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" style={btnPrimary} onClick={() => setHistOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={panel}>
      <div style={panelHeader}>
        <h2 style={panelTitle}>{title}</h2>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  )
}

function PolicyRows(props: {
  items: PolicySettingItem[]
  editKey: string | null
  editDraft: string
  pending: boolean
  onDraftChange: (v: string) => void
  onEdit: (item: PolicySettingItem) => void
  onCancel: () => void
  onSave: () => void
  onHistory: (key: string) => void
}) {
  const { items, editKey, editDraft, pending, onDraftChange, onEdit, onCancel, onSave, onHistory } = props

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item) => {
        const label = SHORT_LABEL[item.key] ?? item.key
        const editing = editKey === item.key

        return (
          <div
            key={item.key}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'start',
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: 14, color: '#111827' }}>{label}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{item.description ?? ''}</div>
              <div style={{ marginTop: 10 }}>
                {editing ? (
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    style={inputStyle}
                    disabled={pending}
                  />
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', wordBreak: 'break-all' }}>
                    {maskValue(item.key, item.value)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {editing ? (
                  <>
                    <button type="button" style={btnGhost} disabled={pending} onClick={onCancel}>
                      취소
                    </button>
                    <button type="button" style={btnPrimary} disabled={pending} onClick={onSave}>
                      저장
                    </button>
                  </>
                ) : (
                  <button type="button" style={btnGhost} disabled={pending} onClick={() => onEdit(item)}>
                    수정
                  </button>
                )}
                <button type="button" style={btnGhost} disabled={pending} onClick={() => onHistory(item.key)}>
                  이력
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const panel: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
}
const panelHeader: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #f3f4f6',
}
const panelTitle: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 900 }

const btnPrimary: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: '#fff',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: '#fff',
  color: '#111827',
  border: '1px solid #e5e7eb',
}
const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: '#047857',
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: 16,
}
const modal: React.CSSProperties = {
  width: 'min(440px, 100%)',
  background: '#fff',
  borderRadius: 14,
  padding: '22px 20px',
  boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 14,
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  color: '#6b7280',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
}
const td: React.CSSProperties = {
  fontSize: 12,
  color: '#111827',
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'top',
  wordBreak: 'break-all',
}
