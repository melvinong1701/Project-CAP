import crypto from 'crypto'
import { decryptSecret, ENCRYPTED_SECRET_PREFIX, encryptSecret } from '@/lib/credentialCrypto'

process.env.CREDENTIAL_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString('base64')

const plaintext = 'credential-smoke-test-secret'
const encrypted = encryptSecret(plaintext)

if (!encrypted.startsWith(ENCRYPTED_SECRET_PREFIX)) {
  throw new Error('Encrypted secret is missing enc:v1 prefix.')
}

if (encrypted === plaintext) {
  throw new Error('Encrypted secret should not match plaintext.')
}

if (decryptSecret(encrypted) !== plaintext) {
  throw new Error('Encrypted secret did not decrypt to the original plaintext.')
}

if (decryptSecret('legacy-plaintext') !== 'legacy-plaintext') {
  throw new Error('Legacy plaintext passthrough failed.')
}

if (decryptSecret(null) !== null || decryptSecret('') !== '') {
  throw new Error('Null or empty credential passthrough failed.')
}

console.log('Credential crypto smoke check passed.')
