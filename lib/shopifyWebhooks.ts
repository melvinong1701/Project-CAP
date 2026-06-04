export const SHOPIFY_WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'ORDERS_UPDATED',
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
] as const

export type ShopifyWebhookTopic = typeof SHOPIFY_WEBHOOK_TOPICS[number]

const WEBHOOK_SUBSCRIPTION_CREATE_MUTATION = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        uri
      }
      userErrors {
        field
        message
      }
    }
  }
`

interface ShopifyWebhookUserError {
  field?: string[]
  message: string
}

interface ShopifyWebhookCreateResponse {
  data?: {
    webhookSubscriptionCreate?: {
      userErrors: ShopifyWebhookUserError[]
    }
  }
  errors?: { message?: string }[]
}

function formatShopifyWebhookError(data: ShopifyWebhookCreateResponse, status: number) {
  const userErrors = data.data?.webhookSubscriptionCreate?.userErrors ?? []
  if (userErrors.length > 0) {
    return userErrors.map(error => error.message).join('; ')
  }

  if (data.errors && data.errors.length > 0) {
    return data.errors.map(error => error.message ?? 'Unknown Shopify GraphQL error').join('; ')
  }

  return `Shopify returned status ${status}`
}

function isDuplicateShopifyWebhookError(error: ShopifyWebhookUserError) {
  const message = error.message.toLowerCase()
  return message.includes('already been taken') || message.includes('already exists')
}

export async function registerShopifyWebhook(params: {
  shop: string
  accessToken: string
  topic: ShopifyWebhookTopic
  webhookUrl: string
}): Promise<void> {
  const webhookRes = await fetch(`https://${params.shop}/admin/api/2026-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': params.accessToken,
    },
    body: JSON.stringify({
      query: WEBHOOK_SUBSCRIPTION_CREATE_MUTATION,
      variables: {
        topic: params.topic,
        webhookSubscription: {
          uri: params.webhookUrl,
        },
      },
    }),
  })

  const webhookData = await webhookRes.json() as ShopifyWebhookCreateResponse
  const userErrors = webhookData.data?.webhookSubscriptionCreate?.userErrors ?? []
  const graphQLErrors = webhookData.errors ?? []

  if (webhookRes.ok && graphQLErrors.length === 0 && userErrors.length > 0 && userErrors.every(isDuplicateShopifyWebhookError)) {
    return
  }

  if (!webhookRes.ok || userErrors.length > 0 || graphQLErrors.length > 0) {
    throw new Error(`Failed to register Shopify webhook ${params.topic}: ${formatShopifyWebhookError(webhookData, webhookRes.status)}`)
  }
}
