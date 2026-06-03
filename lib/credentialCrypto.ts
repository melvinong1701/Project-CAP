import crypto from 'crypto'

export const ENCRYPTED_SECRET_PREFIX = 'enc:v1:'

function getCredentialEncryptionKey() {
  const rawKey = process.env.CREDENTIAL_ENCRYPTION_KEY

  if (!rawKey) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured.')
  }

  const key = Buffer.from(rawKey, 'base64')
  if (key.length !== 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
  }

  return key
}

export function encryptSecret(plaintext: string): string {
  const key = getCredentialEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    'enc',
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export function decryptSecret(value: string | null): string | null {
  if (value === null || value === '') return value
  if (!value.startsWith(ENCRYPTED_SECRET_PREFIX)) return value

  const parts = value.split(':')
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted secret format.')
  }

  const [, version, ivB64, authTagB64, ciphertextB64] = parts
  if (version !== 'v1') {
    throw new Error(`Unsupported encrypted secret version: ${version}`)
  }

  const key = getCredentialEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
