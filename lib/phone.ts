import { isValidPhoneNumber, parsePhoneNumber, type CountryCode } from 'libphonenumber-js'

/**
 * Normalise a phone number to digits-only E.164 (no leading `+`).
 */
export function normalizePhone(raw: string | null | undefined, country?: string): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const countryCode = country as CountryCode | undefined

  try {
    const parsed = parsePhoneNumber(trimmed, countryCode)
    if (!parsed || !isValidPhoneNumber(trimmed, countryCode)) {
      const digitsOnly = trimmed.replace(/\D/g, '')
      return digitsOnly || null
    }

    return parsed.format('E.164').replace('+', '')
  } catch {
    const digitsOnly = trimmed.replace(/\D/g, '')
    return digitsOnly || null
  }
}
