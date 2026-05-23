export const notificationDefaults = {
  new_message: true,
  ai_escalation: true,
  weekly_digest: false,
}

export const preferenceDefaults = {
  language: 'en',
  timezone: 'Asia/Singapore',
}

export const languageValues = ['en', 'ms', 'id'] as const

export type LanguageValue = (typeof languageValues)[number]

export const planConfig: Record<string, { name: string; tier: string; storeLimit: number; aiConversationPool: number }> = {
  starter: { name: 'Starter', tier: 'Starter', storeLimit: 2, aiConversationPool: 500 },
  growth: { name: 'Growth', tier: 'Growth', storeLimit: 5, aiConversationPool: 2000 },
  scale: { name: 'Scale', tier: 'Scale', storeLimit: 10, aiConversationPool: 5000 },
}

export function isLanguageValue(value: unknown): value is LanguageValue {
  return typeof value === 'string' && languageValues.includes(value as LanguageValue)
}

export function normalizeNotifications(value: unknown) {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

  return {
    new_message: typeof record.new_message === 'boolean' ? record.new_message : notificationDefaults.new_message,
    ai_escalation: typeof record.ai_escalation === 'boolean' ? record.ai_escalation : notificationDefaults.ai_escalation,
    weekly_digest: typeof record.weekly_digest === 'boolean' ? record.weekly_digest : notificationDefaults.weekly_digest,
  }
}

export function normalizePreferences(value: unknown) {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

  return {
    language: isLanguageValue(record.language) ? record.language : preferenceDefaults.language,
    timezone: typeof record.timezone === 'string' && record.timezone.trim()
      ? record.timezone.trim()
      : preferenceDefaults.timezone,
  }
}
