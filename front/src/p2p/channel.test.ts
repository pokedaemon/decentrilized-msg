import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { P2PChannel } from './channel';

// ── BroadcastChannel mock ─────────────────────────────────────────────────────

type MessageHandler = (e: { data: unknown }) => void;
const channels = new Map<string, Set<MessageHandler>>();

class MockBroadcastChannel {
  name: string;
  onmessage: MessageHandler | null = null;

  constructor(name: string) {
    this.name = name;
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add((e) => this.onmessage?.(e));
  }

  postMessage(data: unknown) {
    channels.get(this.name)?.forEach(h => h({ data }));
  }

  close() {
    channels.delete(this.name);
  }
}

beforeEach(() => {
  channels.clear();
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeChannel(id = 'peer-a', name = 'Alice', key = 'aabbcc') {
  return new P2PChannel(id, name, key);
}

// ── Construction & announce ───────────────────────────────────────────────────

describe('P2PChannel construction', () => {
  it('creates without throwing', () => {
    const ch = makeChannel();
    expect(ch).toBeDefined();
    ch.close();
  });

  it('getPeers() returns empty array initially', () => {
    const ch = makeChannel();
    expect(ch.getPeers()).toEqual([]);
    ch.close();
  });
});

// ── Peer discovery ────────────────────────────────────────────────────────────

describe('peer discovery', () => {
  it('fires peer_joined when another peer announces', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const joined: unknown[] = [];
    alice.on('peer_joined', d => joined.push(d));

    const bob = makeChannel('bob', 'Bob', 'bbbb');

    expect(joined.length).toBeGreaterThan(0);
    expect((joined[0] as { username: string }).username).toBe('Bob');

    alice.close();
    bob.close();
  });

  it('adds discovered peer to getPeers()', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const bob = makeChannel('bob', 'Bob', 'bbbb');

    const peers = alice.getPeers();
    expect(peers.some(p => p.peerId === 'bob')).toBe(true);

    alice.close();
    bob.close();
  });

  it('fires peer_updated (not peer_joined) for a known peer', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const joined: unknown[] = [];
    const updated: unknown[] = [];
    alice.on('peer_joined', d => joined.push(d));
    alice.on('peer_updated', d => updated.push(d));

    const bob = makeChannel('bob', 'Bob', 'bbbb');

    const joinedBefore = joined.length;

    // Bob announces again (simulates re-announce interval)
    bob['announce']();

    expect(joined.length).toBe(joinedBefore);
    expect(updated.length).toBeGreaterThan(0);

    alice.close();
    bob.close();
  });

  it('does not emit events for own messages', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const joined: unknown[] = [];
    alice.on('peer_joined', d => joined.push(d));

    // Alice re-announces — should NOT trigger peer_joined on herself
    alice['announce']();
    expect(joined).toHaveLength(0);

    alice.close();
  });
});

// ── Messaging ─────────────────────────────────────────────────────────────────

describe('sendMessage / receive message', () => {
  it('delivers message to the correct recipient', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const bob = makeChannel('bob', 'Bob', 'bbbb');

    const received: unknown[] = [];
    bob.on('message', d => received.push(d));

    const payload = {
      from: 'alice',
      encryptedB64: 'base64data==',
      nonceB64: 'nonce==',
      senderPublicKeyHex: 'aaaa',
      cid: 'QmFakeCid',
      timestamp: Date.now(),
    };

    alice.sendMessage('bob', payload);

    expect(received.length).toBe(1);
    expect((received[0] as { from: string }).from).toBe('alice');

    alice.close();
    bob.close();
  });

  it('does not deliver message to wrong recipient', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const bob = makeChannel('bob', 'Bob', 'bbbb');
    const carol = makeChannel('carol', 'Carol', 'cccc');

    const carolReceived: unknown[] = [];
    carol.on('message', d => carolReceived.push(d));

    const payload = {
      from: 'alice',
      encryptedB64: 'data==',
      nonceB64: 'nonce==',
      senderPublicKeyHex: 'aaaa',
      cid: 'QmFakeCid',
      timestamp: Date.now(),
    };

    alice.sendMessage('bob', payload);

    expect(carolReceived).toHaveLength(0);

    alice.close();
    bob.close();
    carol.close();
  });

  it('delivers the full payload unchanged', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const bob = makeChannel('bob', 'Bob', 'bbbb');

    let receivedMsg: unknown;
    bob.on('message', d => { receivedMsg = d; });

    const payload = {
      from: 'alice',
      encryptedB64: 'ZW5jcnlwdGVk',
      nonceB64: 'bm9uY2U=',
      senderPublicKeyHex: 'aaaa',
      cid: 'QmTestCidABCDEF',
      timestamp: 1_700_000_000_000,
    };

    alice.sendMessage('bob', payload);

    expect(receivedMsg).toMatchObject(payload);

    alice.close();
    bob.close();
  });
});

// ── Event subscriptions ───────────────────────────────────────────────────────

describe('on / off', () => {
  it('off() removes the handler', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const events: unknown[] = [];
    const handler = (d: unknown) => events.push(d);

    alice.on('peer_joined', handler);
    const bob = makeChannel('bob', 'Bob', 'bbbb');
    expect(events.length).toBeGreaterThan(0);

    alice.off('peer_joined', handler);
    events.length = 0;

    const carol = makeChannel('carol', 'Carol', 'cccc');
    expect(events).toHaveLength(0);

    alice.close(); bob.close(); carol.close();
  });

  it('allows multiple handlers for the same event', () => {
    const alice = makeChannel('alice', 'Alice', 'aaaa');
    const calls: string[] = [];

    alice.on('peer_joined', () => calls.push('h1'));
    alice.on('peer_joined', () => calls.push('h2'));

    const bob = makeChannel('bob', 'Bob', 'bbbb');

    expect(calls).toContain('h1');
    expect(calls).toContain('h2');

    alice.close(); bob.close();
  });
});

// ── PeerInfo content ──────────────────────────────────────────────────────────

describe('PeerInfo fields', () => {
  it('peer info contains peerId, username, publicKeyHex', () => {
    const alice = makeChannel('alice', 'Alice', 'aabbccdd');
    let peer: unknown;
    alice.on('peer_joined', d => { peer = d; });

    const bob = makeChannel('bob', 'Bob', 'ddccbbaa');

    expect(peer).toMatchObject({
      peerId: 'bob',
      username: 'Bob',
      publicKeyHex: 'ddccbbaa',
    });

    alice.close(); bob.close();
  });
});
