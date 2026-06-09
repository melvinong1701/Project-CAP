export type OrderForMatch = {
  id: string
  order_reference: string | null
  external_order_id: string
  raw_payload: unknown
}

const MIN_POSTCODE_LENGTH = 4
const TOKEN_EDGE = '[^A-Za-z0-9]'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function uniqueOrderIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export function customerMessageContents(history: Array<{ sender: string; content: string }>): string[] {
  return history
    .filter(message => message.sender === 'customer')
    .map(message => message.content)
}

export function toOrderIdArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function identifierVariants(order: OrderForMatch): string[] {
  const variants = new Set<string>()
  const orderReference = order.order_reference?.trim()
  const externalOrderId = order.external_order_id.trim()

  if (orderReference) {
    variants.add(orderReference)
    variants.add(orderReference.startsWith('#') ? orderReference.slice(1) : `#${orderReference}`)
  }

  if (externalOrderId) {
    variants.add(externalOrderId)
  }

  return Array.from(variants).filter(Boolean)
}

function messageContainsIdentifier(message: string, identifier: string): boolean {
  const pattern = new RegExp(`(^|${TOKEN_EDGE})${escapeRegExp(identifier)}($|${TOKEN_EDGE})`, 'i')
  return pattern.test(message)
}

function messageContainsPostcode(message: string, postcode: string): boolean {
  const flexiblePostcode = Array.from(postcode)
    .map(char => escapeRegExp(char))
    .join('\\s*')
  const pattern = new RegExp(`(^|${TOKEN_EDGE})${flexiblePostcode}($|${TOKEN_EDGE})`, 'i')

  return pattern.test(message)
}

// Extract the shipping postcode from Shopify's raw order payload. Other channels are out of scope for this MVP gate.
export function postcodeFromOrder(rawPayload: unknown): string | null {
  const raw = asRecord(rawPayload)
  const shippingAddress = asRecord(raw?.shipping_address)
  const zip = shippingAddress?.zip

  if (typeof zip === 'string') {
    const trimmed = zip.trim()
    return trimmed || null
  }

  if (typeof zip === 'number') {
    return String(zip)
  }

  return null
}

export function normalisePostcode(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

export function ordersMentionedByCustomer(params: {
  customerMessages: string[]
  orders: OrderForMatch[]
}): string[] {
  const mentionedIds: string[] = []

  for (const order of params.orders) {
    const identifiers = identifierVariants(order)
    const isMentioned = identifiers.some(identifier =>
      params.customerMessages.some(message => messageContainsIdentifier(message, identifier))
    )

    if (isMentioned) {
      mentionedIds.push(order.id)
    }
  }

  return uniqueOrderIds(mentionedIds)
}

export function ordersVerifiedByPostcode(params: {
  message: string
  orders: OrderForMatch[]
}): string[] {
  const verifiedIds: string[] = []

  for (const order of params.orders) {
    const postcode = postcodeFromOrder(order.raw_payload)
    if (!postcode) {
      continue
    }

    const normalisedPostcode = normalisePostcode(postcode)
    if (normalisedPostcode.length < MIN_POSTCODE_LENGTH) {
      continue
    }

    if (messageContainsPostcode(params.message, normalisedPostcode)) {
      verifiedIds.push(order.id)
    }
  }

  return uniqueOrderIds(verifiedIds)
}
