import nacl from 'tweetnacl';

/**
 * Encryption Service — client-side E2E encryption using TweetNaCl.
 *
 * Algorithm: NaCl box (X25519 key exchange + XSalsa20-Poly1305 encryption)
 * Base64 encoding: uses native browser btoa/atob — no extra packages needed.
 *
 * Requirements 9.1–9.8
 */

const STORAGE_PREFIX = 'enc_sk_';

// ─── Base64 helpers (browser-native) ─────────────────────────────────────────

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(str) {
  return new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0)));
}

// ─── Key Management ────────────────────────────────────────────────────────────

/**
 * initKeys — get or create a key pair for the user.
 * Requirement 9.1 — reuse existing key on same device, don't regenerate.
 *
 * @param {string} userId
 * @returns {{ publicKey: string, secretKey: Uint8Array }}
 */
export function initKeys(userId) {
  const storageKey = `${STORAGE_PREFIX}${userId}`;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    const secretKey = fromBase64(stored);
    const keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    return {
      publicKey: toBase64(keyPair.publicKey),
      secretKey: keyPair.secretKey,
    };
  }

  // First time on this device — generate a new key pair
  const keyPair = nacl.box.keyPair();
  localStorage.setItem(storageKey, toBase64(keyPair.secretKey));
  return {
    publicKey: toBase64(keyPair.publicKey),
    secretKey: keyPair.secretKey,
  };
}

/**
 * getSecretKey — retrieve the stored secret key for a user.
 */
export function getSecretKey(userId) {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  if (!stored) return null;
  return fromBase64(stored);
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * encryptMessage — encrypt plaintext for a recipient.
 * Requirement 9.3
 *
 * @param {string}     plaintext
 * @param {string}     recipientPublicKeyB64
 * @param {Uint8Array} senderSecretKey
 * @returns {string} base64 ciphertext (nonce prepended)
 */
export function encryptMessage(plaintext, recipientPublicKeyB64, senderSecretKey) {
  const recipientPublicKey = fromBase64(recipientPublicKeyB64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = new TextEncoder().encode(plaintext);

  const encrypted = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey);
  if (!encrypted) throw new Error('Encryption failed');

  // Prepend nonce so recipient can extract it
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return toBase64(combined);
}

/**
 * decryptMessage — decrypt a ciphertext message.
 * Requirement 9.4 + 9.5
 *
 * @param {string}     ciphertextB64
 * @param {string}     senderPublicKeyB64
 * @param {Uint8Array} recipientSecretKey
 * @returns {string} plaintext
 * @throws {Error} 'DECRYPTION_FAILED' if decryption fails
 */
export function decryptMessage(ciphertextB64, senderPublicKeyB64, recipientSecretKey) {
  const combined = fromBase64(ciphertextB64);
  const nonce = combined.slice(0, nacl.box.nonceLength);
  const ciphertext = combined.slice(nacl.box.nonceLength);
  const senderPublicKey = fromBase64(senderPublicKeyB64);

  const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientSecretKey);
  if (!decrypted) throw new Error('DECRYPTION_FAILED');

  return new TextDecoder().decode(decrypted);
}
