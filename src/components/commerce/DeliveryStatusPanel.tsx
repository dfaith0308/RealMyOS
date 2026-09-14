'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { getAdminOrderDelivery, recordAdminDeliveryStatus } from '@/actions/admin/commerce-delivery'
import { getSupplierOrderDelivery, recordSupplierDeliveryStatus } from '@/actions/storefront-delivery'
import type { OrderDeliveryDetail } from '@/lib/delivery-tracking/read'
import {
  DELIVERY_EVENT_OUTCOME_LABEL,
  DELIVERY_PROGRESS_STATUSES,
  DELIVERY_STATUS_LABEL,
  deliveryProgressRank,
  isDeliveryException,
  manualDeliveryOptions,
  type DeliveryStatus,
} from '@/lib/delivery-tracking/status'

const BRAND = '#1f5d3a'
const LINE = '#e5e7eb'
const MUTED = '#6b7280'
const DANGER = '#b91c1c'

function newSubmissionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/**
 * 배송 상태 입력 패널 — 관리자(주문처리·배송현황)와 공급자(스토어 주문 배송) 화면이 같이 쓴다.
 *
 * 버튼 목록은 화면용 힌트다(이미 지난 단계는 숨김). 반영 여부는 서버 판정 함수가 최종 결정하고,
 * 그 결과(반영 / 같은 상태 / 이전 단계라 무시 / 이미 완료)를 그대로 보여준다.
 *
 * 중복 방지: 버튼을 누를 때 쓰는 제출 키는 서버 응답을 받을 때까지 바꾸지 않는다.
 * 더블클릭이나 네트워크 재시도는 같은 키로 가서 한 번만 반영된다.
 */
export default function DeliveryStatusPanel({
  mode,
  orderId,
  canWrite = true,
  readOnlyReason,
  onChanged,
}: {
  mode: 'admin' | 'supplier'
  orderId: string
  canWrite?: boolean
  readOnlyReason?: string
  onChanged?: () => void
}) {
  const [detail, setDetail] = useState<OrderDeliveryDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [carrier, setCarrier] = useState('')
  const [trackingNo, setTrackingNo] = useState('')
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const submissionRef = useRef<string>(newSubmissionId())

  const load = useCallback(async () => {
    const res = mode === 'admin' ? await getAdminOrderDelivery(orderId) : await getSupplierOrderDelivery(orderId)
    if (!res.success || !res.data) {
      setLoadError(res.error ?? '배송 정보를 불러오지 못했습니다')
      setDetail(null)
      return
    }
    setLoadError(null)
    setDetail(res.data)
    setCarrier((prev) => prev || res.data!.delivery_carrier || '')
    setTrackingNo((prev) => prev || res.data!.delivery_tracking_no || '')
  }, [mode, orderId])

  useEffect(() => {
    void load()
  }, [load])

  function submit(status: DeliveryStatus) {
    setMessage(null)
    const submission_id = submissionRef.current
    startTransition(async () => {
      const input = {
        order_id: orderId,
        status,
        submission_id,
        carrier: carrier.trim() || null,
        tracking_no: trackingNo.trim() || null,
        note: note.trim() || null,
      }
      let res
      try {
        res = mode === 'admin' ? await recordAdminDeliveryStatus(input) : await recordSupplierDeliveryStatus(input)
      } catch {
        // 응답을 못 받았다 — 키를 유지해 재시도가 중복 반영되지 않게 한다
        setMessage({ tone: 'error', text: '네트워크 오류입니다. 같은 버튼을 다시 누르면 한 번만 반영됩니다.' })
        return
      }
      // 서버가 판단을 돌려줬으면 다음 입력은 새 사건이다
      submissionRef.current = newSubmissionId()
      if (!res.success || !res.data) {
        setMessage({ tone: 'error', text: res.error ?? '저장 실패' })
        return
      }
      const d = res.data
      if (d.duplicate) {
        setMessage({ tone: 'warn', text: '이미 처리된 입력입니다 (중복 반영 안 함)' })
      } else if (d.outcome === 'applied') {
        setMessage({
          tone: 'ok',
          text: `「${DELIVERY_STATUS_LABEL[status]}」 반영됨${d.became_delivered ? ' — 배송 완료 사건이 기록되었습니다' : ''}`,
        })
        setNote('')
      } else {
        setMessage({ tone: 'warn', text: DELIVERY_EVENT_OUTCOME_LABEL[d.outcome] ?? d.outcome })
      }
      await load()
      onChanged?.()
    })
  }

  if (loadError) {
    return (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, fontSize: 13, color: MUTED }}>
        배송 추적: {loadError}
      </div>
    )
  }
  if (!detail) {
    return <div style={{ fontSize: 13, color: MUTED, padding: 12 }}>배송 정보 불러오는 중…</div>
  }

  const current = detail.delivery_status
  const orderOpen = ['paid', 'preparing', 'shipped', 'completed'].includes(detail.order_status)
  const options = manualDeliveryOptions(current, detail.max_reached_rank)
  const reachedRank = Math.max(detail.max_reached_rank ?? -1, deliveryProgressRank(current) ?? -1)

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>배송 추적</strong>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 999,
            color: isDeliveryException(current) ? DANGER : current ? BRAND : MUTED,
            background: isDeliveryException(current) ? '#fef2f2' : current ? '#f0f7f3' : '#f3f4f6',
          }}
        >
          {current ? DELIVERY_STATUS_LABEL[current] : '추적 시작 전'}
        </span>
      </div>

      {/* 진행 6단계 — 도달한 단계까지 채운다. 예외 상태여도 과거 도달 단계는 유지해 보인다 */}
      <ol style={{ display: 'flex', gap: 4, listStyle: 'none', padding: 0, margin: '12px 0 4px', flexWrap: 'wrap' }}>
        {DELIVERY_PROGRESS_STATUSES.map((s, i) => (
          <li
            key={s}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              border: `1px solid ${i <= reachedRank ? BRAND : LINE}`,
              background: i <= reachedRank ? '#f0f7f3' : '#fff',
              color: i <= reachedRank ? BRAND : MUTED,
              fontWeight: s === current ? 800 : 500,
            }}
          >
            {DELIVERY_STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      {detail.delivery_carrier || detail.delivery_tracking_no ? (
        <p style={{ fontSize: 12, color: MUTED, margin: '6px 0 0' }}>
          {detail.delivery_carrier ?? '택배사 미입력'} · {detail.delivery_tracking_no ?? '송장번호 없음(자체 배송)'}
        </p>
      ) : null}

      {!orderOpen ? (
        <p style={{ fontSize: 12, color: MUTED, margin: '10px 0 0' }}>
          결제 확인 전이거나 취소·환불된 주문은 배송 상태를 입력할 수 없습니다.
        </p>
      ) : !canWrite ? (
        <p style={{ fontSize: 12, color: MUTED, margin: '10px 0 0' }}>{readOnlyReason ?? '읽기 전용입니다.'}</p>
      ) : current === 'delivered' ? (
        <p style={{ fontSize: 12, color: BRAND, margin: '10px 0 0', fontWeight: 600 }}>
          배송 완료된 주문입니다. 이후 입력은 반영되지 않습니다.
        </p>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="택배사 (자체 배송이면 비움)"
              maxLength={40}
              style={inputStyle}
            />
            <input
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="송장번호 (선택)"
              maxLength={40}
              style={inputStyle}
            />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모 — 확인 필요는 사유 필수 (지연·주소 오류·반송 등)"
            maxLength={300}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {options.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => submit(s)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  border: `1px solid ${s === 'attention' ? DANGER : BRAND}`,
                  background: s === 'delivered' ? BRAND : '#fff',
                  color: s === 'delivered' ? '#fff' : s === 'attention' ? DANGER : BRAND,
                  fontFamily: 'inherit',
                }}
              >
                {DELIVERY_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {message ? (
        <p
          style={{
            fontSize: 12,
            margin: '10px 0 0',
            color: message.tone === 'ok' ? BRAND : message.tone === 'warn' ? '#92400e' : DANGER,
          }}
        >
          {message.text}
        </p>
      ) : null}

      {detail.events.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: MUTED, cursor: 'pointer' }}>입력 기록 {detail.events.length}건</summary>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.events
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} style={{ fontSize: 12, borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
                  <span style={{ fontWeight: 700 }}>{DELIVERY_STATUS_LABEL[e.mapped_status]}</span>
                  <span style={{ color: e.outcome === 'applied' ? BRAND : MUTED }}>
                    {' '}
                    · {DELIVERY_EVENT_OUTCOME_LABEL[e.outcome] ?? e.outcome}
                  </span>
                  <span style={{ color: MUTED }}>
                    {' '}
                    · {e.source_label} · {fmtWhen(e.occurred_at)}
                  </span>
                  {e.raw_status && e.raw_status !== e.mapped_status ? (
                    <span style={{ color: MUTED }}> · 원본 값 「{e.raw_status}」</span>
                  ) : null}
                  {e.note ? <div style={{ color: '#374151', marginTop: 2 }}>{e.note}</div> : null}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: '1 1 140px',
  minWidth: 0,
  padding: '7px 10px',
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
