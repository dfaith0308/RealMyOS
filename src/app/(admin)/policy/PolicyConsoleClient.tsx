'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  checkPolicyConflict,
  getAdminSettingHistory,
  getPolicyImpactPreview,
  sendPolicyConsoleAligoTest,
  updateAdminSetting,
  type AdminSettingHistoryRow,
  type GroupedPolicySettings,
  type PolicySettingItem,
} from '@/actions/admin/policy-console'
import s from '../admin-shared.module.css'

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
  if (key === 'aligo_api_key' && value.length > 0)
    return '•'.repeat(Math.min(24, value.length)) + (value.length > 24 ? '…' : '')
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
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false)
  const [applyConflictMsg, setApplyConflictMsg] = useState<string | null>(null)
  const [applyImpactMsg, setApplyImpactMsg] = useState<string | null>(null)

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
    setApplyConflictMsg(null)
    setApplyImpactMsg(null)
    setApplyOpen(true)

    setApplyPreviewLoading(true)
    startTransition(async () => {
      const [conf, impact] = await Promise.all([
        checkPolicyConflict(editKey, editDraft),
        getPolicyImpactPreview(editKey, editDraft),
      ])
      setApplyPreviewLoading(false)

      if (conf.success) {
        setApplyConflictMsg(conf.data?.message ?? null)
      } else {
        setApplyConflictMsg(null)
        setApplyErr(conf.error ?? '충돌 감지 실패')
      }

      if (impact.success) {
        setApplyImpactMsg(impact.data?.message ?? null)
      } else {
        setApplyImpactMsg(null)
        setApplyErr((prev) => prev ?? impact.error ?? '영향 범위 미리보기 실패')
      }
    })
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
    <div className={s.stackCol}>
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
        <div className={s.policyNotifyRow}>
          <button type="button" className={s.policySecondaryBtn} disabled={pending} onClick={sendTest}>
            테스트 발송
          </button>
          {testMsg && <span className={s.testMsg}>{testMsg}</span>}
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
        <div className={s.overlayModal}>
          <div className={s.modalBox}>
            <h3 className={s.modalTitle}>정책 적용 확인</h3>
            <p className={s.modalBody}>
              이 값을 변경하면 <strong>즉시 적용</strong>됩니다. (캐시 없음)
            </p>
            {applyPreviewLoading && <p className={s.loadingHint}>충돌/영향 미리보기 계산 중…</p>}
            {!applyPreviewLoading && applyConflictMsg && (
              <p className={s.modalAlert} role="alert">
                경고: {applyConflictMsg}
              </p>
            )}
            {!applyPreviewLoading && applyImpactMsg && (
              <p className={s.modalMuted}>
                {applyImpactMsg}
              </p>
            )}
            <p className={s.modalMuted}>
              키: <code className={s.code}>{applyPayload.key}</code>
            </p>
            <pre className={s.modalPre}>{applyPayload.value || '(빈 값)'}</pre>
            {applyErr && (
              <p className={s.modalAlert} role="alert">
                {applyErr}
              </p>
            )}
            <div className={s.modalFooter}>
              <button type="button" className={s.policyCompactGhost} disabled={pending} onClick={() => setApplyOpen(false)}>
                취소
              </button>
              <button type="button" className={s.policyCompactPrimary} disabled={pending} onClick={confirmApply}>
                {pending ? '저장 중…' : '확인 후 적용'}
              </button>
            </div>
          </div>
        </div>
      )}

      {histOpen && (
        <div className={s.overlayModal}>
          <div className={`${s.modalBox} ${s.modalWide}`}>
            <h3 className={s.modalTitle}>변경 이력</h3>
            <p className={s.modalMuted}>
              키: <code className={s.code}>{histKey}</code>
            </p>
            {histLoading && <p className={s.loadingHint}>불러오는 중…</p>}
            {histErr && (
              <p className={s.modalAlert} role="alert">
                {histErr}
              </p>
            )}
            {!histLoading && !histErr && histRows.length === 0 && <p className={s.emptyHist}>이력이 없습니다.</p>}
            {!histLoading && histRows.length > 0 && (
              <div className={s.historyTableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr className={s.theadRow}>
                      {['일시', '이전', '이후', '변경자'].map((h) => (
                        <th key={h} className={s.thSm}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histRows.map((r) => (
                      <tr key={r.id}>
                        <td className={s.tdSm}>{String(r.created_at).slice(0, 19).replace('T', ' ')}</td>
                        <td className={s.tdSm}>{r.before_value ?? '—'}</td>
                        <td className={s.tdSm}>{r.after_value ?? '—'}</td>
                        <td className={s.tdSm}>{r.admin_id ? `${String(r.admin_id).slice(0, 8)}…` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={s.modalFooterLoose}>
              <button type="button" className={s.policyCompactPrimary} onClick={() => setHistOpen(false)}>
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
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h2 className={s.panelTitle}>{title}</h2>
      </div>
      <div className={s.panelBody}>{children}</div>
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
    <div className={s.policyRowsStack}>
      {items.map((item) => {
        const label = SHORT_LABEL[item.key] ?? item.key
        const editing = editKey === item.key

        return (
          <div key={item.key} className={s.policyRowCard}>
            <div>
              <div className={s.policyLabel}>{label}</div>
              <div className={s.policyDesc}>{item.description ?? ''}</div>
              <div className={s.policyEditGap}>
                {editing ? (
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    className={s.policyInput}
                    disabled={pending}
                  />
                ) : (
                  <div className={s.policyValue}>{maskValue(item.key, item.value)}</div>
                )}
              </div>
            </div>
            <div className={s.policyActionsCol}>
              <div className={s.policyActionsRow}>
                {editing ? (
                  <>
                    <button type="button" className={s.policyCompactGhost} disabled={pending} onClick={onCancel}>
                      취소
                    </button>
                    <button type="button" className={s.policyCompactPrimary} disabled={pending} onClick={onSave}>
                      저장
                    </button>
                  </>
                ) : (
                  <button type="button" className={s.policyCompactGhost} disabled={pending} onClick={() => onEdit(item)}>
                    수정
                  </button>
                )}
                <button type="button" className={s.policyCompactGhost} disabled={pending} onClick={() => onHistory(item.key)}>
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
