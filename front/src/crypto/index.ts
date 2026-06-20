import nacl from 'tweetnacl';

export type IdentityKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

// --- Encoding helpers ---

export function toHex(arr: Uint8Array): string {
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function toBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

// --- Base58 (for Solana-like address) ---
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function toBase58(arr: Uint8Array): string {
  let num = BigInt('0x' + (toHex(arr) || '00'));
  let result = '';
  while (num > 0n) {
    result = B58[Number(num % 58n)] + result;
    num /= 58n;
  }
  for (const byte of arr) {
    if (byte !== 0) break;
    result = '1' + result;
  }
  return result || '1';
}

// --- Key generation ---

export function generateKeyPair(): IdentityKeyPair {
  return nacl.box.keyPair();
}

export function keyPairFromSecretKey(secretKeyHex: string): IdentityKeyPair {
  return nacl.box.keyPair.fromSecretKey(fromHex(secretKeyHex));
}

// --- Fingerprint for display ---

export function fingerprint(publicKey: Uint8Array): string {
  const hex = toHex(publicKey).toUpperCase();
  const chunks: string[] = [];
  for (let i = 0; i < 16; i += 4) chunks.push(hex.slice(i, i + 4));
  return chunks.join(' ');
}

// --- Encryption (X25519 ECDH + XSalsa20-Poly1305) ---

export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
): { encryptedB64: string; nonceB64: string; cid: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const msg = new TextEncoder().encode(plaintext);
  const encrypted = nacl.box(msg, nonce, recipientPublicKey, senderSecretKey);
  const encryptedB64 = toBase64(encrypted);
  const nonceB64 = toBase64(nonce);
  return { encryptedB64, nonceB64, cid: fakeCID(encryptedB64 + nonceB64) };
}

export function decryptMessage(
  encryptedB64: string,
  nonceB64: string,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): string | null {
  try {
    const decrypted = nacl.box.open(
      fromBase64(encryptedB64),
      fromBase64(nonceB64),
      senderPublicKey,
      recipientSecretKey,
    );
    if (!decrypted) return null;
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// --- Fake IPFS CID (deterministic hash for demo) ---

function fakeCID(seed: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0x7fffffff;
  let result = 'Qm';
  for (let i = 0; i < 44; i++) {
    result += chars[Math.abs(h) % chars.length];
    h = (h * 1664525 + 1013904223) & 0x7fffffff;
  }
  return result;
}
