import { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export interface ShopifyGraphqlProductVariant {
  id: string
  title: string
  price: string
  sku: string | null
  availableForSale: boolean
}

export interface ShopifyGraphqlProductImage {
  url: string
  altText: string | null
}

export interface ShopifyGraphqlProduct {
  id: string
  title: string
  descriptionHtml: string
  productType: string
  tags: string[]
  status: string
  variants: { edges: { node: ShopifyGraphqlProductVariant }[] }
  images: { edges: { node: ShopifyGraphqlProductImage }[] }
}

export interface ShopifyWebhookProductVariant {
  id: number | string
  title?: string | null
  price?: string | number | null
  sku?: string | null
  available?: boolean | null
}

export interface ShopifyWebhookProductImage {
  src?: string | null
  alt?: string | null
}

export interface ShopifyWebhookProduct {
  id: number | string
  title?: string | null
  body_html?: string | null
  product_type?: string | null
  tags?: string | string[] | null
  status?: string | null
  variants?: ShopifyWebhookProductVariant[] | null
  images?: ShopifyWebhookProductImage[] | null
}

export interface StoreProductRow {
  organization_id: string
  store_id: string
  platform_id: 'shopify'
  external_product_id: string
  title: string
  description: string | null
  product_type: string | null
  tags: string[]
  status: string | null
  variants: {
    id: string
    title: string | null
    price: string | null
    sku: string | null
    availableForSale: boolean
  }[]
  images: {
    url: string
    altText: string | null
  }[]
  raw_payload: ShopifyGraphqlProduct | ShopifyWebhookProduct
  synced_at: string
}

export function shopifyProductGid(id: number | string) {
  const value = String(id)
  return value.startsWith('gid://') ? value : `gid://shopify/Product/${value}`
}

export function shopifyProductToRow(
  product: ShopifyGraphqlProduct,
  organizationId: string,
  storeId: string
): StoreProductRow {
  return {
    organization_id: organizationId,
    store_id: storeId,
    platform_id: 'shopify',
    external_product_id: product.id,
    title: product.title,
    description: product.descriptionHtml || null,
    product_type: product.productType || null,
    tags: product.tags,
    status: product.status,
    variants: product.variants.edges.map(edge => edge.node),
    images: product.images.edges.map(edge => edge.node),
    raw_payload: product,
    synced_at: new Date().toISOString(),
  }
}

export function shopifyWebhookProductToRow(
  product: ShopifyWebhookProduct,
  organizationId: string,
  storeId: string
): StoreProductRow {
  return {
    organization_id: organizationId,
    store_id: storeId,
    platform_id: 'shopify',
    external_product_id: shopifyProductGid(product.id),
    title: product.title || 'Untitled product',
    description: product.body_html || null,
    product_type: product.product_type || null,
    tags: normalizeWebhookTags(product.tags),
    status: product.status || null,
    variants: (product.variants ?? []).map(variant => ({
      id: String(variant.id),
      title: variant.title ?? null,
      price: variant.price === undefined || variant.price === null ? null : String(variant.price),
      sku: variant.sku ?? null,
      availableForSale: Boolean(variant.available),
    })),
    images: (product.images ?? []).map(image => ({
      url: image.src ?? '',
      altText: image.alt ?? null,
    })).filter(image => image.url),
    raw_payload: product,
    synced_at: new Date().toISOString(),
  }
}

export async function upsertProduct(
  supabase: SupabaseClient,
  row: StoreProductRow
): Promise<PostgrestError | null> {
  const { error } = await supabase
    .from('store_products')
    .upsert(row, { onConflict: 'organization_id,store_id,platform_id,external_product_id' })

  return error
}

export async function deleteProduct(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    storeId: string
    externalProductId: string
  }
): Promise<PostgrestError | null> {
  const { error } = await supabase
    .from('store_products')
    .delete()
    .eq('organization_id', params.organizationId)
    .eq('store_id', params.storeId)
    .eq('platform_id', 'shopify')
    .eq('external_product_id', params.externalProductId)

  return error
}

function normalizeWebhookTags(tags: ShopifyWebhookProduct['tags']) {
  if (Array.isArray(tags)) {
    return tags.map(tag => tag.trim()).filter(Boolean)
  }

  if (typeof tags === 'string') {
    return tags.split(',').map(tag => tag.trim()).filter(Boolean)
  }

  return []
}
