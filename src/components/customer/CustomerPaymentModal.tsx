'use client'

import PaymentCreateForm from '@/components/payment/PaymentCreateForm'

export default function CustomerPaymentModal({
  customerId,
  customerName,
  onClose,
  onDone,
}: {
  customerId: string
  customerName: string
  onClose: () => void
  onDone: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`수금 등록 — ${customerName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid #e5e7eb',
            position: 'sticky',
            top: 0,
            background: '#fff',
            zIndex: 1,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2b2b2b' }}>
            수금 등록 — {customerName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              lineHeight: 1,
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '12px 16px 20px' }}>
          <PaymentCreateForm
            initialCustomerId={customerId}
            embedded
            onSuccess={() => {
              onDone()
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}
