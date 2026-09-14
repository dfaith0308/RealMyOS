'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  createDetailTemplate,
  updateOrderGuideSettings,
  type DetailTemplateListRow,
} from '@/actions/admin/detail-templates'
import { WEEKDAY_LABELS, type OrderGuideSettings } from '@/lib/detail-template/system'
import s from '../../../admin-shared.module.css'

export default function DetailTemplatesClient({
  templates,
  totalFields,
  guide,
  guideError,
}: {
  templates: DetailTemplateListRow[]
  totalFields: number
  guide: OrderGuideSettings | null
  guideError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cutoff, setCutoff] = useState(guide?.cutoffTime ?? '')
  const [days, setDays] = useState<number[]>(guide?.deliveryWeekdays ?? [])
  const [guideMsg, setGuideMsg] = useState<string | null>(null)

  function create() {
    setError(null)
    startTransition(async () => {
      const r = await createDetailTemplate(title)
      if (!r.success || !r.data) {
        setError(r.error ?? '만들지 못했습니다')
        return
      }
      router.push(`/admin/commerce/detail-templates/${r.data.id}`)
    })
  }

  function saveGuide() {
    setGuideMsg(null)
    startTransition(async () => {
      const r = await updateOrderGuideSettings({ cutoffTime: cutoff, deliveryWeekdays: days })
      setGuideMsg(r.success ? '저장했습니다 — 모든 템플릿 상세페이지의 「06 발주 안내」에 반영됩니다' : r.error ?? '저장 실패')
      if (r.success) router.refresh()
    })
  }

  return (
    <>
      <section className={s.kpiCard} style={{ marginBottom: 16 }}>
        <h2 className={s.kpiTitle}>새 템플릿</h2>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            className={s.input}
            style={{ flex: '1 1 260px' }}
            placeholder="관리용 이름 (식당 화면에 안 보임) — 예: 국내산 깐마늘"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="button" className={s.primaryBtn} disabled={pending || !title.trim()} onClick={create}>
            만들기
          </button>
        </div>
        {error ? <p className={s.errText}>{error}</p> : null}
      </section>

      <section className={s.kpiCard} style={{ marginBottom: 16 }}>
        <h2 className={s.kpiTitle}>플랫폼 발주 안내 (시스템값 — 상품마다 넣지 않음)</h2>
        {guideError ? (
          <p className={s.errText}>{guideError}</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 13 }}>
                발주 마감{' '}
                <input
                  type="time"
                  className={s.input}
                  style={{ width: 130 }}
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                />
              </label>
              <span style={{ fontSize: 13 }}>배송 요일</span>
              {WEEKDAY_LABELS.map((label, i) => {
                const d = i + 1
                const on = days.includes(d)
                return (
                  <label key={d} style={{ fontSize: 13, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d].sort()))}
                    />
                    {label}
                  </label>
                )
              })}
              <button type="button" className={s.ghostBtn} disabled={pending} onClick={saveGuide}>
                저장
              </button>
            </div>
            <p className={s.cellMutedSm} style={{ marginTop: 8 }}>
              비워 두면 상세페이지에서 해당 줄이 숨겨집니다. 최소 주문·배송비는 상품 등록 값에서 자동으로 나옵니다.
            </p>
            {guideMsg ? <p style={{ fontSize: 12, margin: '6px 0 0' }}>{guideMsg}</p> : null}
          </>
        )}
      </section>

      {templates.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--ds-text-secondary)' }}>아직 템플릿이 없습니다</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.th}>관리용 이름</th>
                <th className={s.th}>연결된 옵션</th>
                <th className={s.th}>채운 칸</th>
                <th className={s.th}>수정일</th>
                <th className={s.th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className={s.td}>
                    <Link href={`/admin/commerce/detail-templates/${t.id}`} className={s.cellStrong}>
                      {t.title}
                    </Link>
                  </td>
                  <td className={s.td}>{t.option_count}개</td>
                  <td className={s.td}>
                    {t.filled_count} / {totalFields}
                  </td>
                  <td className={s.tdNowrap}>
                    {new Date(t.updated_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className={s.td}>{t.archived_at ? '보관됨' : '사용 중'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
