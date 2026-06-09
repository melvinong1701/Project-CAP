import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type OrderForMatch,
  ordersMentionedByCustomer,
  ordersVerifiedByPostcode,
} from './orderVerification'

const ownedOrder: OrderForMatch = {
  id: 'order-1',
  order_reference: '#1002',
  external_order_id: 'gid://shopify/Order/5002001',
  raw_payload: {
    shipping_address: {
      zip: '120 304',
    },
  },
}

const repeatAddressOrder: OrderForMatch = {
  id: 'order-2',
  order_reference: '#1008',
  external_order_id: 'gid://shopify/Order/5002008',
  raw_payload: {
    shipping_address: {
      zip: '120304',
    },
  },
}

test('customer message mentioning a real order reference makes that order disclosable', () => {
  assert.deepEqual(
    ordersMentionedByCustomer({
      customerMessages: ['Hi, can you check order 1002 for me?'],
      orders: [ownedOrder],
    }),
    ['order-1']
  )
})

test('matching postcode returns order ids that can be persisted into the verified set', () => {
  const existingVerifiedOrderIds = new Set<string>()
  const verifiedByPostcode = ordersVerifiedByPostcode({
    message: 'The postal code is 120 304',
    orders: [ownedOrder, repeatAddressOrder],
  })

  for (const orderId of verifiedByPostcode) {
    existingVerifiedOrderIds.add(orderId)
  }

  assert.deepEqual(Array.from(existingVerifiedOrderIds), ['order-1', 'order-2'])
})

test('postcode-only message with a non-matching postcode verifies nothing', () => {
  assert.deepEqual(
    ordersVerifiedByPostcode({
      message: 'The postcode is 999999',
      orders: [ownedOrder],
    }),
    []
  )
  assert.deepEqual(
    ordersMentionedByCustomer({
      customerMessages: ['The postcode is 999999'],
      orders: [ownedOrder],
    }),
    []
  )
})

test('order reference only in an agent or AI message is not disclosable', () => {
  const customerMessages = ['Where is my order?']

  assert.deepEqual(
    ordersMentionedByCustomer({
      customerMessages,
      orders: [ownedOrder],
    }),
    []
  )
})

test('guessed sequential reference for an order the customer does not own is not disclosable', () => {
  assert.deepEqual(
    ordersMentionedByCustomer({
      customerMessages: ['Is this about #1003?'],
      orders: [ownedOrder],
    }),
    []
  )
})
