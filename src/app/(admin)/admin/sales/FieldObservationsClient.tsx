'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { uploadListingImage } from '@/actions/admin/commerce'
import {
  applyFieldObservationActions,
  createFieldObservation,
} from '@/actions/admin/field-observations'
import {
  CONTENT_TAG,
  OBSERVATION_VIEW_OPTIONS,
  suggestCompanyName,
  type FieldObservationRow,
  type ObservationAction,
  type ObservationView,
} from '@/types/field-observation'
import s from '../../admin-shared.module.css'
import c from './sales.module.css'

/** 상세이미지 업로드와 같은 피커 필터 */
const ACCEPT_IMAGE =
  'image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,image/heic,image/heif,application/octet-stream,.jpg,.jpeg,.png,.webp,.heic,.heif'
const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024
const MAX_PHOTOS = 10

type LeadTypeChoice = 'restaurant' | 'supplier'

type PhotoSlot = {
  id: string
  url: string
  name: string
  status: 'uploading' | 'done' | 'error'
  error?: string
}

/** 관찰기록 하나에 체크한 처리들 */
type Selection = {
  restaurant: boolean
  supplier: boolean
  keep: boolean
  discard: boolean
  company: string
}

const EMPTY_SELECTION: Selection = {
  restaurant: false,
  supplier: false,
  keep: false,
  discard: false,
  company: '',
}

function slotId(): string {
  try {
    const g = globalThis.crypto
    if (g && typeof g.randomUUID === 'function') return g.randomUUID()
  } catch {
    /* 비보안 컨텍스트에서는 randomUUID 를 못 쓴다 */
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 상세이미지 업로드와 동일 기준 */
function validateImageFile(file: File): string | null {
  if (file.size === 0) return '빈 파일입니다'
  if (file.size > MAX_IMAGE_FILE_BYTES) return '8MB 이하 이미지만 업로드 가능합니다'

  const mime = (file.type ?? '').trim().toLowerCase()
  const extOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
  const mimeOk = /^image\/(jpeg|jpg|pjpeg|png|webp|heic|heif)/i.test(mime)
  const octetOk = mime === 'application/octet-stream' && extOk

  if (extOk || mimeOk || octetOk) return null
  return 'JPG/PNG/WebP/HEIC·HEIF만 업로드 가능합니다'
}

/** 자유 입력 태그 — 쉼표·공백·줄바꿈으로 나눈다 */
function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter((t) => t.length > 0 && t.length <= 20),
    ),
  ).slice(0, 10)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function FieldObservationsClient({
  view,
  observations,
  q,
}: {
  view: ObservationView
  observations: FieldObservationRow[]
  q: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // ── 빠른 등록 폼 ──
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [memo, setMemo] = useState('')
  const [tagText, setTagText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // ── 목록 체크박스 ──
  const [selections, setSelections] = useState<Record<string, Selection>>({})
  const [applyError, setApplyError] = useState<string | null>(null)

  const uploading = photos.some((p) => p.status === 'uploading')
  const parsedTags = useMemo(() => parseTags(tagText), [tagText])

  const readOnlyView = view === 'converted' || view === 'discarded'

  const checkedIds = useMemo(
    () =>
      Object.entries(selections)
        .filter(([, v]) => v.restaurant || v.supplier || v.keep || v.discard)
        .map(([id]) => id),
    [selections],
  )

  function sel(id: string): Selection {
    return selections[id] ?? EMPTY_SELECTION
  }

  function updateSelection(row: FieldObservationRow, patch: Partial<Selection>) {
    setApplyError(null)
    setSelections((prev) => {
      const cur = prev[row.id] ?? { ...EMPTY_SELECTION, company: suggestCompanyName(row.memo) }
      let next: Selection = { ...cur, ...patch }
      // "삭제"는 나머지와 뜻이 반대라 함께 고를 수 없다
      if (patch.discard === true) next = { ...next, restaurant: false, supplier: false, keep: false }
      if (patch.restaurant || patch.supplier || patch.keep) next = { ...next, discard: false }
      return { ...prev, [row.id]: next }
    })
  }

  // ── 사진 업로드 (상세이미지 업로드와 같은 서버 액션·버킷) ──
  async function uploadOne(slot: PhotoSlot, file: File) {
    const fd = new FormData()
    fd.set('file', file)
    try {
      const res = await uploadListingImage(fd)
      setPhotos((prev) =>
        prev.map((p) =>
          p.id !== slot.id
            ? p
            : res.success
              ? { ...p, url: res.data?.url ?? '', status: 'done' as const }
              : { ...p, status: 'error' as const, error: res.error ?? '업로드 실패' },
        ),
      )
    } catch {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id !== slot.id
            ? p
            : { ...p, status: 'error' as const, error: '네트워크 오류로 업로드에 실패했습니다' },
        ),
      )
    }
  }

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setFormError(null)
    setOkMsg(null)

    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setFormError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다`)
      return
    }
    if (files.length > room) setFormError(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다`)

    for (const file of files.slice(0, room)) {
      const invalid = validateImageFile(file)
      const slot: PhotoSlot = {
        id: slotId(),
        url: '',
        name: file.name,
        status: invalid ? 'error' : 'uploading',
        error: invalid ?? undefined,
      }
      setPhotos((prev) => [...prev, slot])
      if (!invalid) void uploadOne(slot, file)
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  function handleSave() {
    setFormError(null)
    setOkMsg(null)
    if (!memo.trim()) {
      setFormError('메모를 입력하세요')
      return
    }
    if (uploading) {
      setFormError('사진 업로드가 끝난 뒤 저장해 주세요')
      return
    }

    const photo_urls = photos.filter((p) => p.status === 'done' && p.url).map((p) => p.url)

    start(async () => {
      const res = await createFieldObservation({ memo, photo_urls, tags: parsedTags })
      if (!res.success) {
        setFormError(res.error ?? '저장에 실패했습니다')
        return
      }
      setMemo('')
      setTagText('')
      setPhotos([])
      setOkMsg('관찰기록을 저장했습니다.')
      router.refresh()
    })
  }

  function handleApply() {
    setApplyError(null)
    setOkMsg(null)
    if (checkedIds.length === 0) return

    const items: ObservationAction[] = checkedIds.map((id) => {
      const v = sel(id)
      const lead_types: LeadTypeChoice[] = []
      if (v.restaurant) lead_types.push('restaurant')
      if (v.supplier) lead_types.push('supplier')
      return {
        observation_id: id,
        lead_types,
        company_name: v.company,
        keep_as_content: v.keep,
        discard: v.discard,
      }
    })

    const missingName = items.find((it) => it.lead_types.length > 0 && !it.company_name.trim())
    if (missingName) {
      setApplyError('리드로 전환할 항목의 업체명을 입력하세요')
      return
    }

    start(async () => {
      const res = await applyFieldObservationActions(items)
      if (!res.success) {
        setApplyError(res.error ?? '확정에 실패했습니다')
        return
      }
      const d = res.data
      const parts: string[] = []
      if (d && d.lead_ids.length > 0) parts.push(`리드 ${d.lead_ids.length}건 생성`)
      if (d && d.kept > 0) parts.push(`콘텐츠 소재 ${d.kept}건`)
      if (d && d.discarded > 0) parts.push(`삭제 ${d.discarded}건`)
      setSelections({})
      setOkMsg(parts.length > 0 ? `확정 완료 — ${parts.join(' · ')}` : '확정 완료')
      router.refresh()
    })
  }

  function go(next: { view?: ObservationView; q?: string }) {
    const params = new URLSearchParams()
    params.set('tab', 'observations')
    const v = next.view ?? view
    if (v !== 'unclassified') params.set('view', v)
    const query = (next.q ?? q).trim()
    if (query) params.set('q', query)
    start(() => {
      router.push(`/admin/sales?${params.toString()}`)
    })
  }

  return (
    <>
      {/* ── 빠른 등록 ── */}
      <section className={c.obsForm}>
        <h2 className={c.cardTitle}>빠른 등록</h2>

        <label className={c.photoBtn}>
          <span className={c.photoBtnIcon}>＋</span>
          사진 첨부
          <span className={c.photoBtnSub}>여러 장 가능 · 선택</span>
          <input
            type="file"
            accept={ACCEPT_IMAGE}
            multiple
            className={c.hiddenInput}
            onChange={onPickPhotos}
            disabled={pending}
          />
        </label>

        {photos.length > 0 && (
          <div className={c.photoGrid}>
            {photos.map((p) => (
              <div key={p.id} className={c.photoItem}>
                {p.status === 'done' && p.url ? (
                  <img src={p.url} alt="" className={c.photoImg} />
                ) : (
                  <div className={c.photoPlaceholder}>
                    {p.status === 'uploading' ? '업로드 중…' : '실패'}
                  </div>
                )}
                <button
                  type="button"
                  className={c.photoRemove}
                  onClick={() => removePhoto(p.id)}
                  aria-label="사진 제거"
                >
                  ×
                </button>
                {p.status === 'error' && <span className={c.photoErr}>{p.error}</span>}
              </div>
            ))}
          </div>
        )}

        <textarea
          className={c.obsTextarea}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="본 것·들은 것을 그대로 적으세요. 예) 월현식당 앞 탑차 010-0000-0000, 상추 매일 아침 납품"
          disabled={pending}
        />

        <input
          className={c.formInput}
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="태그 (선택) — 쉼표나 공백으로 구분. 예: 탑차 상추 성남"
          disabled={pending}
        />
        {parsedTags.length > 0 && (
          <div className={c.obsTagPreview}>
            {parsedTags.map((t) => (
              <span key={t} className={c.tagChip}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {formError && <p className={c.errText}>{formError}</p>}
        {okMsg && <p className={c.okText}>{okMsg}</p>}

        <button
          type="button"
          className={c.obsSaveBtn}
          onClick={handleSave}
          disabled={pending || uploading}
        >
          {pending ? '저장 중…' : uploading ? '사진 업로드 중…' : '저장'}
        </button>
      </section>

      {/* ── 목록 ── */}
      <div className={c.obsViewRow}>
        {OBSERVATION_VIEW_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${c.obsViewBtn} ${view === o.value ? c.obsViewBtnActive : ''}`}
            onClick={() => go({ view: o.value })}
          >
            {o.label}
          </button>
        ))}
        <input
          className={`${c.textInput} ${c.grow}`}
          placeholder="메모 검색"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value })
          }}
          onBlur={(e) => {
            if (e.target.value !== q) go({ q: e.target.value })
          }}
        />
      </div>

      {observations.length === 0 ? (
        <div className={s.empty}>
          {q ? '검색 결과가 없습니다.' : '아직 관찰기록이 없습니다.'}
        </div>
      ) : (
        <div className={c.obsList}>
          {observations.map((o) => {
            const v = selections[o.id] ?? {
              ...EMPTY_SELECTION,
              company: suggestCompanyName(o.memo),
            }
            const wantsLead = v.restaurant || v.supplier
            return (
              <article key={o.id} className={c.obsCard}>
                <div className={c.obsCardHead}>
                  <span className={c.obsDate}>{formatDateTime(o.created_at)}</span>
                  {o.tags.map((t) => (
                    <span key={t} className={c.tagChip}>
                      #{t}
                    </span>
                  ))}
                  {o.status === 'converted' && <span className={c.obsBadgeDone}>전환됨</span>}
                  {o.status === 'discarded' && <span className={c.obsBadgeGone}>버림</span>}
                </div>

                {o.photo_urls.length > 0 && (
                  <div className={c.obsPhotos}>
                    {o.photo_urls.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer">
                        <img src={u} alt="" className={c.obsThumb} />
                      </a>
                    ))}
                  </div>
                )}

                <p className={c.obsMemo}>{o.memo}</p>

                {!readOnlyView && (
                  <>
                    <div className={c.obsCheckRow}>
                      <label className={c.obsCheck}>
                        <input
                          type="checkbox"
                          checked={v.restaurant}
                          disabled={pending}
                          onChange={(e) => updateSelection(o, { restaurant: e.target.checked })}
                        />
                        식당 리드로
                      </label>
                      <label className={c.obsCheck}>
                        <input
                          type="checkbox"
                          checked={v.supplier}
                          disabled={pending}
                          onChange={(e) => updateSelection(o, { supplier: e.target.checked })}
                        />
                        공급자 리드로
                      </label>
                      <label className={c.obsCheck}>
                        <input
                          type="checkbox"
                          checked={v.keep}
                          disabled={pending || o.tags.includes(CONTENT_TAG)}
                          onChange={(e) => updateSelection(o, { keep: e.target.checked })}
                        />
                        보관만 (콘텐츠 소재)
                      </label>
                      <label className={`${c.obsCheck} ${c.obsCheckDanger}`}>
                        <input
                          type="checkbox"
                          checked={v.discard}
                          disabled={pending}
                          onChange={(e) => updateSelection(o, { discard: e.target.checked })}
                        />
                        삭제
                      </label>
                    </div>

                    {wantsLead && (
                      <div className={c.obsCompanyRow}>
                        <label className={c.obsCompanyLabel}>업체명 *</label>
                        <input
                          className={c.formInput}
                          value={v.company}
                          disabled={pending}
                          placeholder="예: 월현식당"
                          onChange={(e) => updateSelection(o, { company: e.target.value })}
                        />
                      </div>
                    )}
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className={c.hint}>
        {observations.length}건 표시 {pending && '· 처리 중…'}
      </p>

      {applyError && <p className={c.errText}>{applyError}</p>}

      {checkedIds.length > 0 && (
        <div className={c.obsBar}>
          <span className={c.obsBarText}>{checkedIds.length}건 선택됨</span>
          <Link href="/admin/sales?tab=restaurant" className={c.obsBarLink}>
            리드 목록
          </Link>
          <button
            type="button"
            className={c.obsBarBtn}
            onClick={handleApply}
            disabled={pending}
          >
            {pending ? '확정 중…' : '확정'}
          </button>
        </div>
      )}
    </>
  )
}
