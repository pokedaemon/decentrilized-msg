import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  keyPairFromSecretKey,
  encryptMessage,
  decryptMessage,
  toHex,
  fromHex,
  toBase58,
  fingerprint,
} from './index';

// ── toHex / fromHex ───────────────────────────────────────────────────────────

describe('toHex / fromHex', () => {
  it('converts bytes to hex string', () => {
    const arr = new Uint8Array([0x00, 0xff, 0x1a, 0xb2]);
    expect(toHex(arr)).toBe('00ff1ab2');
  });

  it('round-trips toHex → fromHex', () => {
    const original = new Uint8Array(32).map((_, i) => i);
    expect(fromHex(toHex(original))).toEqual(original);
  });

  it('handles zeros', () => {
    const zeros = new Uint8Array(4);
    expect(toHex(zeros)).toBe('00000000');
    expect(fromHex('00000000')).toEqual(zeros);
  });
});

// ── toBase58 ──────────────────────────────────────────────────────────────────

describe('toBase58', () => {
  it('returns a non-empty string', () => {
    const kp = generateKeyPair();
    const b58 = toBase58(kp.publicKey);
    expect(b58.length).toBeGreaterThan(0);
  });

  it('uses only Base58 alphabet', () => {
    const kp = generateKeyPair();
    const b58 = toBase58(kp.publicKey);
    expect(/^[1-9A-HJ-NP-Za-km-z]+$/.test(b58)).toBe(true);
  });

  it('all-zero array → all "1"', () => {
    const zeros = new Uint8Array(4);
    expect(toBase58(zeros)).toBe('1111');
  });
});

// ── generateKeyPair ───────────────────────────────────────────────────────────

describe('generateKeyPair', () => {
  it('returns a key pair with correct sizes', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
  });

  it('generates unique key pairs each time', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(toHex(a.publicKey)).not.toBe(toHex(b.publicKey));
  });
});

// ── keyPairFromSecretKey ──────────────────────────────────────────────────────

describe('keyPairFromSecretKey', () => {
  it('restores the same public key', () => {
    const kp = generateKeyPair();
    const restored = keyPairFromSecretKey(toHex(kp.secretKey));
    expect(toHex(restored.publicKey)).toBe(toHex(kp.publicKey));
  });
});

// ── fingerprint ───────────────────────────────────────────────────────────────

describe('fingerprint', () => {
  it('returns a string of 4 space-separated groups', () => {
    const kp = generateKeyPair();
    const fp = fingerprint(kp.publicKey);
    const parts = fp.split(' ');
    expect(parts.length).toBe(4);
    parts.forEach(p => expect(p.length).toBe(4));
  });

  it('is consistent for the same key', () => {
    const kp = generateKeyPair();
    expect(fingerprint(kp.publicKey)).toBe(fingerprint(kp.publicKey));
  });

  it('differs for different keys', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(fingerprint(a.publicKey)).not.toBe(fingerprint(b.publicKey));
  });
});

// ── encryptMessage / decryptMessage ───────────────────────────────────────────

describe('encrypt / decrypt — happy path', () => {
  it('decrypts back to the original plaintext', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const plaintext = 'Привет, Боб!';

    const { encryptedB64, nonceB64 } = encryptMessage(
      plaintext,
      bob.publicKey,
      alice.secretKey,
    );

    const result = decryptMessage(encryptedB64, nonceB64, alice.publicKey, bob.secretKey);
    expect(result).toBe(plaintext);
  });

  it('works in both directions (Alice→Bob and Bob→Alice)', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const msgA = 'Alice to Bob';
    const { encryptedB64: encA, nonceB64: nonceA } = encryptMessage(msgA, bob.publicKey, alice.secretKey);
    expect(decryptMessage(encA, nonceA, alice.publicKey, bob.secretKey)).toBe(msgA);

    const msgB = 'Bob to Alice';
    const { encryptedB64: encB, nonceB64: nonceB } = encryptMessage(msgB, alice.publicKey, bob.secretKey);
    expect(decryptMessage(encB, nonceB, bob.publicKey, alice.secretKey)).toBe(msgB);
  });

  it('handles empty string', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { encryptedB64, nonceB64 } = encryptMessage('', bob.publicKey, alice.secretKey);
    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, bob.secretKey)).toBe('');
  });

  it('handles long messages', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const long = 'А'.repeat(10_000);
    const { encryptedB64, nonceB64 } = encryptMessage(long, bob.publicKey, alice.secretKey);
    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, bob.secretKey)).toBe(long);
  });

  it('handles emoji and unicode', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const msg = '🔐 Секретное сообщение 🌐 Hello! 日本語';
    const { encryptedB64, nonceB64 } = encryptMessage(msg, bob.publicKey, alice.secretKey);
    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, bob.secretKey)).toBe(msg);
  });
});

describe('encrypt — output properties', () => {
  it('encryptedB64 is valid base64', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { encryptedB64 } = encryptMessage('test', bob.publicKey, alice.secretKey);
    expect(() => atob(encryptedB64)).not.toThrow();
  });

  it('returns an IPFS-like CID starting with Qm', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { cid } = encryptMessage('hello', bob.publicKey, alice.secretKey);
    expect(cid.startsWith('Qm')).toBe(true);
    expect(cid.length).toBeGreaterThan(10);
  });

  it('same plaintext produces different ciphertext each time (random nonce)', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const msg = 'same message';
    const r1 = encryptMessage(msg, bob.publicKey, alice.secretKey);
    const r2 = encryptMessage(msg, bob.publicKey, alice.secretKey);
    expect(r1.encryptedB64).not.toBe(r2.encryptedB64);
  });
});

describe('decrypt — failure cases', () => {
  it('returns null with wrong recipient key', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const eve = generateKeyPair();

    const { encryptedB64, nonceB64 } = encryptMessage('secret', bob.publicKey, alice.secretKey);
    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, eve.secretKey)).toBeNull();
  });

  it('returns null with wrong sender key', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const eve = generateKeyPair();

    const { encryptedB64, nonceB64 } = encryptMessage('secret', bob.publicKey, alice.secretKey);
    expect(decryptMessage(encryptedB64, nonceB64, eve.publicKey, bob.secretKey)).toBeNull();
  });

  it('returns null with tampered ciphertext', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const { encryptedB64, nonceB64 } = encryptMessage('secret', bob.publicKey, alice.secretKey);

    // Flip a byte in the middle of base64
    const tampered = encryptedB64.slice(0, 10) + 'X' + encryptedB64.slice(11);
    expect(decryptMessage(tampered, nonceB64, alice.publicKey, bob.secretKey)).toBeNull();
  });

  it('returns null with wrong nonce', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const { encryptedB64 } = encryptMessage('secret', bob.publicKey, alice.secretKey);
    const { nonceB64: wrongNonce } = encryptMessage('other', bob.publicKey, alice.secretKey);

    expect(decryptMessage(encryptedB64, wrongNonce, alice.publicKey, bob.secretKey)).toBeNull();
  });

  it('returns null on invalid base64', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    expect(decryptMessage('not!base64', 'also!bad', alice.publicKey, bob.secretKey)).toBeNull();
  });
});

// ── E2EE гарантии (integration) ───────────────────────────────────────────────

describe('E2EE security properties', () => {
  it('Eve cannot decrypt a message between Alice and Bob', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const eve = generateKeyPair();

    const { encryptedB64, nonceB64 } = encryptMessage('топ-секрет', bob.publicKey, alice.secretKey);

    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, eve.secretKey)).toBeNull();
    expect(decryptMessage(encryptedB64, nonceB64, eve.publicKey, bob.secretKey)).toBeNull();
    expect(decryptMessage(encryptedB64, nonceB64, alice.publicKey, bob.secretKey)).toBe('топ-секрет');
  });

  it('ciphertext reveals nothing about the plaintext length (poly1305 overhead only)', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    const short = 'Hi';
    const r1 = encryptMessage(short, bob.publicKey, alice.secretKey);
    const shortLen = atob(r1.encryptedB64).length;

    const long = 'H'.repeat(100);
    const r2 = encryptMessage(long, bob.publicKey, alice.secretKey);
    const longLen = atob(r2.encryptedB64).length;

    // Overhead = 16 bytes (Poly1305 MAC)
    expect(shortLen - short.length).toBe(16);
    expect(longLen - long.length).toBe(16);
  });
});
