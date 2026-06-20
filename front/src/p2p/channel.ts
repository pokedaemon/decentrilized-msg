export interface PeerInfo {
  peerId: string;
  username: string;
  publicKeyHex: string;
}

export interface P2PMessage {
  from: string;
  encryptedB64: string;
  nonceB64: string;
  senderPublicKeyHex: string;
  cid: string;
  timestamp: number;
  expiresAt?: number;
}

type Handler = (data: unknown) => void;

export class P2PChannel {
  private bc: BroadcastChannel;
  private peerId: string;
  private username: string;
  private publicKeyHex: string;
  private handlers = new Map<string, Set<Handler>>();
  private peers = new Map<string, PeerInfo>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(peerId: string, username: string, publicKeyHex: string) {
    this.peerId = peerId;
    this.username = username;
    this.publicKeyHex = publicKeyHex;
    this.bc = new BroadcastChannel('dm-p2p-v1');
    this.bc.onmessage = (e) => this.handle(e.data);
    this.announce();
    this.timer = setInterval(() => this.announce(), 4000);
  }

  private announce() {
    this.post({ type: 'announce', from: this.peerId, username: this.username, publicKeyHex: this.publicKeyHex });
  }

  private post(data: Record<string, unknown>) {
    this.bc.postMessage(data);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handle(data: any) {
    if (data.from === this.peerId) return;

    if (data.type === 'announce' || data.type === 'hello') {
      const peer: PeerInfo = { peerId: data.from, username: data.username, publicKeyHex: data.publicKeyHex };
      const isNew = !this.peers.has(peer.peerId);
      this.peers.set(peer.peerId, peer);
      if (isNew) this.emit('peer_joined', peer);
      else this.emit('peer_updated', peer);

      if (data.type === 'announce') {
        this.post({ type: 'hello', from: this.peerId, username: this.username, publicKeyHex: this.publicKeyHex });
      }
    } else if (data.type === 'message' && data.to === this.peerId) {
      this.emit('message', data as P2PMessage);
    }
  }

  sendMessage(to: string, payload: P2PMessage) {
    this.post({ type: 'message', to, ...payload });
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach(h => h(data));
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  close() {
    clearInterval(this.timer);
    this.bc.close();
  }
}
