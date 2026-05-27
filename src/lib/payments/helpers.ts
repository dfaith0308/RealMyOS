import { PAYMENTS_TYPE_PAYOUT_REVERSAL } from '@/lib/inbound-payment-superseded'

export function pickReversalPaymentType(origType: unknown): { type: string; warned: boolean } {
  if (origType != null && String(origType).trim() !== '') {
    return { type: String(origType), warned: false }
  }
  return { type: PAYMENTS_TYPE_PAYOUT_REVERSAL, warned: true }
}
