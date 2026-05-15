/** storefront 무통장 입금 안내 — `admin_settings.key` SSOT */
export const STOREFRONT_BANK_TRANSFER_SETTINGS_KEY = 'storefront_bank_transfer' as const

export type StorefrontBankTransferSettings = {
  bank_name: string
  account_number: string
  account_holder: string
  notice: string
}

const MAX_FIELD = 128
const MAX_NOTICE = 800

export function parseStorefrontBankTransferJson(raw: string | null | undefined): StorefrontBankTransferSettings | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  try {
    const o = JSON.parse(s) as Record<string, unknown>
    const bank_name = typeof o.bank_name === 'string' ? o.bank_name.trim() : ''
    const account_number = typeof o.account_number === 'string' ? o.account_number.trim() : ''
    const account_holder = typeof o.account_holder === 'string' ? o.account_holder.trim() : ''
    const notice = typeof o.notice === 'string' ? o.notice.trim() : ''
    if (!bank_name || !account_number || !account_holder) return null
    return { bank_name, account_number, account_holder, notice }
  } catch {
    return null
  }
}

export function validateStorefrontBankTransferInput(input: {
  bank_name: string
  account_number: string
  account_holder: string
  notice: string
}): string | null {
  const bank_name = input.bank_name.trim()
  const account_number = input.account_number.trim()
  const account_holder = input.account_holder.trim()
  const notice = input.notice.trim()
  if (bank_name.length > MAX_FIELD) return `은행명은 ${MAX_FIELD}자 이하로 입력해 주세요.`
  if (account_number.length > MAX_FIELD) return `계좌번호는 ${MAX_FIELD}자 이하로 입력해 주세요.`
  if (account_holder.length > MAX_FIELD) return `예금주는 ${MAX_FIELD}자 이하로 입력해 주세요.`
  if (notice.length > MAX_NOTICE) return `안내 문구는 ${MAX_NOTICE}자 이하로 입력해 주세요.`
  if ((bank_name || account_number || account_holder) && !(bank_name && account_number && account_holder)) {
    return '은행명·계좌번호·예금주는 모두 입력하거나, 모두 비워 두어야 합니다.'
  }
  return null
}

export function serializeStorefrontBankTransferSettings(input: {
  bank_name: string
  account_number: string
  account_holder: string
  notice: string
}): string {
  const bank_name = input.bank_name.trim()
  const account_number = input.account_number.trim()
  const account_holder = input.account_holder.trim()
  const notice = input.notice.trim()
  return JSON.stringify({ bank_name, account_number, account_holder, notice })
}
