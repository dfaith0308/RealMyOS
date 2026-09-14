'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  linkListingToDetailTemplate,
  searchListingsForDetailTemplate,
  setDetailTemplateArchived,
  unlinkListingFromDetailTemplate,
  updateDetailTemplate,
  updateListingDetailOverride,
  type DetailOptionRow,
  type DetailTemplateDetail,
  type ListingPickRow,
} from '@/actions/admin/detail-templates'
import DetailFieldInput, { toDraft, type DraftValue } from '@/components/commerce/detail-template/DetailFieldInput'
import {
  DETAIL_FIELDS,
  DETAIL_SECTIONS,
  isFilled,
  type DetailFieldDef,
  type DetailFieldKey,
} from '@/lib/detail-template/fields'
import s from '../../../../admin-shared.module.css'

const LINE = '#e5e7eb'
const MUTED = '#6b7280'
const BRAND = '#1f5d3a'

const FROM_LABEL: Record<string, { text: string; color: string }> = {
  option: { text: '옵션 자기 값', color: '#7c3aed' },
  template: { text: '공통 값 사용', color: BRAND },
  empty: { text: '비어 있음 — 식당 화면에서 숨김', color: MUTED },
}

function draftsFrom(values: Partial<Record<DetailFieldKey, unknown>>, defs: DetailFieldDef[]) {
  const out = {} as Record<DetailFieldKey, DraftValue>
  for (const d of defs) out[d.key] = toDraft(d, values[d.key] as never)
  return out
}

export default function DetailTemplateEditorClient({ detail }: { detail: DetailTemplateDetail }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [title, setTitle] = useState(detail.title)
  const [drafts, setDrafts] = useState(() => draftsFrom(detail.values, DETAIL_FIELDS))
  const [openOption, setOpenOption] = useState<string | null>(null)

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okText: string) {
    setMsg(null)
    startTransition(async () => {
      const r = await fn()
      setMsg(r.success ? { ok: true, text: okText } : { ok: false, text: r.error ?? '실패' })
      if (r.success) router.refresh()
    })
  }

  function saveSection(sectionKey: string) {
    const patch: Record<string, unknown> = {}
    for (const d of DETAIL_FIELDS.filter((f) => f.section === sectionKey)) patch[d.key] = drafts[d.key]
    run(() => updateDetailTemplate(detail.id, patch), '공통 값을 저장했습니다')
  }

  const editableSections = DETAIL_SECTIONS.filter((sec) => !sec.system)

  return (
    <>
      {msg ? (
        <p style={{ fontSize: 13, color: msg.ok ? BRAND : '#b91c1c', margin: '0 0 12px' }}>{msg.text}</p>
      ) : null}

      <section className={s.kpiCard} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className={s.input} style={{ flex: '1 1 240px' }} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <button type="button" className={s.ghostBtn} disabled={pending} onClick={() => run(() => updateDetailTemplate(detail.id, { title }), '이름을 저장했습니다')}>
            이름 저장
          </button>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={pending}
            onClick={() =>
              run(
                () => setDetailTemplateArchived(detail.id, !detail.archived_at),
                detail.archived_at ? '보관을 해제했습니다' : '보관했습니다 — 식당 화면에서 이 템플릿 내용이 빠집니다',
              )
            }
          >
            {detail.archived_at ? '보관 해제' : '보관'}
          </button>
        </div>
        {detail.archived_at ? (
          <p className={s.cellMutedSm} style={{ marginTop: 8 }}>
            보관된 템플릿입니다. 연결된 옵션의 식당 화면은 기존 상세 화면으로 보입니다.
          </p>
        ) : null}
      </section>

      <h2 className={s.kpiTitle} style={{ margin: '8px 0' }}>공통 값 (상품)</h2>
      {editableSections.map((sec) => {
        const defs = DETAIL_FIELDS.filter((f) => f.section === sec.key)
        return (
          <section key={sec.key} className={s.kpiCard} style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 10px' }}>
              {sec.no ? `${sec.no} ` : ''}
              {sec.title}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {defs.map((d) => (
                <div key={d.key}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {d.label}
                    {d.optionSource === 'listing' ? (
                      <span style={{ fontWeight: 400, color: MUTED }}> — 옵션 값은 상품 등록 화면의 같은 칸을 먼저 씁니다</span>
                    ) : null}
                  </div>
                  <DetailFieldInput def={d} value={drafts[d.key]} disabled={pending} onChange={(v) => setDrafts((cur) => ({ ...cur, [d.key]: v }))} />
                  {d.hint && d.kind !== 'text' && d.kind !== 'textarea' && d.kind !== 'lines' ? (
                    <p className={s.cellMutedXs} style={{ margin: '4px 0 0' }}>{d.hint}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" className={s.primaryBtn} style={{ marginTop: 12 }} disabled={pending} onClick={() => saveSection(sec.key)}>
              {sec.title} 저장
            </button>
          </section>
        )
      })}

      <section className={s.kpiCard} style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>05 규격×수량 단가표 · 06 발주 안내</h3>
        <p className={s.cellMutedSm} style={{ margin: 0 }}>
          입력 칸이 없습니다. 연결된 옵션의 판매가·대량할인·무료배송 수량·최소주문과 플랫폼 발주 안내 설정에서 자동으로 만들어집니다.
        </p>
      </section>

      <h2 className={s.kpiTitle} style={{ margin: '20px 0 8px' }}>옵션 (연결된 규격) {detail.options.length}개</h2>
      <OptionLinker templateId={detail.id} disabled={pending || Boolean(detail.archived_at)} onDone={() => router.refresh()} />

      {detail.options.map((o) => (
        <OptionPanel
          key={o.listing_id}
          option={o}
          open={openOption === o.listing_id}
          onToggle={() => setOpenOption((cur) => (cur === o.listing_id ? null : o.listing_id))}
          pending={pending}
          run={run}
        />
      ))}
    </>
  )
}

function OptionLinker({ templateId, disabled, onDone }: { templateId: string; disabled: boolean; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ListingPickRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function search() {
    setErr(null)
    startTransition(async () => {
      const r = await searchListingsForDetailTemplate(q)
      if (!r.success) setErr(r.error ?? '검색 실패')
      setRows(r.data?.rows ?? [])
    })
  }

  function link(listingId: string) {
    setErr(null)
    startTransition(async () => {
      const r = await linkListingToDetailTemplate(templateId, listingId)
      if (!r.success) {
        setErr(r.error ?? '연결 실패')
        return
      }
      setRows([])
      setQ('')
      onDone()
    })
  }

  return (
    <section className={s.kpiCard} style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className={s.input}
          style={{ flex: '1 1 240px' }}
          placeholder="연결할 상품 검색 (상품명·브랜드·규격)"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
        />
        <button type="button" className={s.ghostBtn} disabled={disabled || pending || !q.trim()} onClick={search}>
          검색
        </button>
      </div>
      {err ? <p className={s.errText}>{err}</p> : null}
      {rows.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
              <span>
                {r.name} {r.spec ? `· ${r.spec}` : ''} · {r.commerce_price.toLocaleString('ko-KR')}원 · {r.status}
              </span>
              {r.linked_template_id ? (
                <span style={{ color: MUTED }}>{r.linked_template_id === templateId ? '연결됨' : '다른 템플릿에 연결됨'}</span>
              ) : (
                <button type="button" className={s.primaryBtn} disabled={disabled || pending} onClick={() => link(r.id)}>
                  연결
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function OptionPanel({
  option,
  open,
  onToggle,
  pending,
  run,
}: {
  option: DetailOptionRow
  open: boolean
  onToggle: () => void
  pending: boolean
  run: (fn: () => Promise<{ success: boolean; error?: string }>, okText: string) => void
}) {
  const linkDefs = useMemo(() => DETAIL_FIELDS.filter((f) => f.optionSource === 'link'), [])
  const [drafts, setDrafts] = useState(() => draftsFrom(option.overrides, linkDefs))
  const [sortOrder, setSortOrder] = useState(String(option.sort_order))

  const visibleCount = DETAIL_FIELDS.filter((f) => option.resolved[f.key].from !== 'empty').length
  const ownCount = DETAIL_FIELDS.filter((f) => option.resolved[f.key].from === 'option').length

  return (
    <section className={s.kpiCard} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div className={s.cellStrong}>
            {option.name} {option.spec ? `· ${option.spec}` : ''}
          </div>
          <div className={s.cellMutedXs}>
            {option.commerce_price.toLocaleString('ko-KR')}원 · {option.status} · 보이는 칸 {visibleCount}/{DETAIL_FIELDS.length} · 옵션 자기 값 {ownCount}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>
            순서{' '}
            <input className={s.input} style={{ width: 64 }} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={pending}
            onClick={() => run(() => updateListingDetailOverride(option.listing_id, { sort_order: Number(sortOrder) }), '순서를 저장했습니다')}
          >
            순서 저장
          </button>
          <button type="button" className={open ? s.primaryBtn : s.ghostBtn} onClick={onToggle}>
            {open ? '닫기' : '칸별 값'}
          </button>
          <button
            type="button"
            className={s.ghostBtn}
            disabled={pending}
            onClick={() => {
              if (window.confirm('연결을 해제할까요? 이 옵션에 따로 넣은 값은 활동 기록에만 남고, 식당 화면은 기존 상세로 돌아갑니다.')) {
                run(() => unlinkListingFromDetailTemplate(option.listing_id), '연결을 해제했습니다')
              }
            }}
          >
            연결 해제
          </button>
        </div>
      </div>

      {open ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {DETAIL_FIELDS.map((d) => {
            const r = option.resolved[d.key]
            const badge = FROM_LABEL[r.from]
            return (
              <div key={d.key} style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: badge.color }}>{badge.text}</span>
                </div>
                {d.optionSource === 'listing' ? (
                  <p className={s.cellMutedXs} style={{ margin: '4px 0 0' }}>
                    이 칸의 옵션 값은 상품 수정 화면의 「{d.label === '대표 사진' ? '상세 이미지' : d.label}」 칸입니다. 거기서 비우면 공통 값으로 돌아갑니다.
                  </p>
                ) : (
                  <>
                    <div style={{ marginTop: 6 }}>
                      <DetailFieldInput def={d} value={drafts[d.key]} disabled={pending} onChange={(v) => setDrafts((cur) => ({ ...cur, [d.key]: v }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button
                        type="button"
                        className={s.ghostBtn}
                        disabled={pending}
                        onClick={() => run(() => updateListingDetailOverride(option.listing_id, { [d.key]: drafts[d.key] }), `${d.label}: 옵션 값을 저장했습니다`)}
                      >
                        이 옵션 값으로 저장
                      </button>
                      {isFilled(option.overrides[d.key]) ? (
                        <button
                          type="button"
                          className={s.ghostBtn}
                          disabled={pending}
                          onClick={() => {
                            setDrafts((cur) => ({ ...cur, [d.key]: toDraft(d, null) }))
                            run(() => updateListingDetailOverride(option.listing_id, { [d.key]: null }), `${d.label}: 공통 값으로 되돌렸습니다`)
                          }}
                        >
                          공통 값으로 되돌리기
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
