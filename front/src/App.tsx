import React, { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from './auth/AuthContext';
import { Login } from './pages/Login';
import { P2PChannel } from './p2p/channel';
import type { PeerInfo, P2PMessage } from './p2p/channel';
import { encryptMessage, decryptMessage, fromHex } from './crypto';
import CryptoDemo from './pages/CryptoDemo';
import './App.css';

export interface Contact {
  peerId: string;
  username: string;
  publicKeyHex: string;
  isOnline: boolean;
  lastMessage?: string;
  lastTime?: number;
  unread: number;
}

export interface MessageItem {
  id: string;
  text: string;
  encryptedB64: string;
  cid: string;
  timestamp: number;
  expiresAt?: number;
  sender: 'me' | 'them';
}

// TTL options: label → seconds (0 = never)
const TTL_OPTIONS = [
  { label: '∞', seconds: 0 },
  { label: '30с', seconds: 30 },
  { label: '5м', seconds: 300 },
  { label: '1ч', seconds: 3600 },
  { label: '24ч', seconds: 86400 },
] as const;

type View = 'chat' | 'settings' | 'demo';

const App: React.FC = () => {
  const { identity, logout } = useContext(AuthContext);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Record<string, MessageItem[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('chat');
  const [showAddContact, setShowAddContact] = useState(false);
  const [addKeyInput, setAddKeyInput] = useState('');
  const [addNameInput, setAddNameInput] = useState('');
  const [showRawMsg, setShowRawMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ttlSeconds, setTtlSeconds] = useState(0);
  const [now, setNow] = useState(Date.now());
  const channelRef = useRef<P2PChannel | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // init P2P channel
  useEffect(() => {
    if (!identity) return;
    const ch = new P2PChannel(identity.peerId, identity.username, identity.publicKeyHex);
    channelRef.current = ch;

    ch.on('peer_joined', (data) => {
      const peer = data as PeerInfo;
      setContacts(prev => {
        if (prev.find(c => c.peerId === peer.peerId)) {
          return prev.map(c => c.peerId === peer.peerId ? { ...c, isOnline: true, username: peer.username, publicKeyHex: peer.publicKeyHex } : c);
        }
        return [...prev, { peerId: peer.peerId, username: peer.username, publicKeyHex: peer.publicKeyHex, isOnline: true, unread: 0 }];
      });
    });

    ch.on('peer_updated', (data) => {
      const peer = data as PeerInfo;
      setContacts(prev => prev.map(c => c.peerId === peer.peerId ? { ...c, isOnline: true } : c));
    });

    ch.on('message', (data) => {
      const msg = data as P2PMessage;
      if (!identity) return;
      const plaintext = decryptMessage(
        msg.encryptedB64,
        msg.nonceB64,
        fromHex(msg.senderPublicKeyHex),
        fromHex(identity.secretKeyHex),
      );
      if (plaintext === null) return;

      const item: MessageItem = {
        id: `${msg.from}-${msg.timestamp}`,
        text: plaintext,
        encryptedB64: msg.encryptedB64,
        cid: msg.cid,
        timestamp: msg.timestamp,
        expiresAt: msg.expiresAt,
        sender: 'them',
      };

      setMessages(prev => ({
        ...prev,
        [msg.from]: [...(prev[msg.from] ?? []), item],
      }));

      setContacts(prev => prev.map(c =>
        c.peerId === msg.from
          ? { ...c, lastMessage: plaintext, lastTime: msg.timestamp, unread: c.unread + 1 }
          : c,
      ));
    });

    return () => ch.close();
  }, [identity]);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selected]);

  // Tick every second to update countdown timers and purge expired messages
  useEffect(() => {
    const hasExpiring = Object.values(messages).flat().some(m => m.expiresAt);
    if (!hasExpiring) return;
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      setMessages(prev => {
        const next: Record<string, MessageItem[]> = {};
        let changed = false;
        for (const [peerId, msgs] of Object.entries(prev)) {
          const filtered = msgs.filter(m => !m.expiresAt || m.expiresAt > ts);
          next[peerId] = filtered;
          if (filtered.length !== msgs.length) changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [messages]);

  const send = () => {
    if (!input.trim() || !selected || !identity || !channelRef.current) return;
    const contact = contacts.find(c => c.peerId === selected);
    if (!contact) return;

    const { encryptedB64, nonceB64, cid } = encryptMessage(
      input.trim(),
      fromHex(contact.publicKeyHex),
      fromHex(identity.secretKeyHex),
    );

    const ts = Date.now();
    const expiresAt = ttlSeconds > 0 ? ts + ttlSeconds * 1000 : undefined;

    const item: MessageItem = {
      id: `me-${ts}`,
      text: input.trim(),
      encryptedB64,
      cid,
      timestamp: ts,
      expiresAt,
      sender: 'me',
    };

    channelRef.current.sendMessage(selected, {
      from: identity.peerId,
      encryptedB64,
      nonceB64,
      senderPublicKeyHex: identity.publicKeyHex,
      cid,
      timestamp: ts,
      expiresAt,
    });

    setMessages(prev => ({ ...prev, [selected]: [...(prev[selected] ?? []), item] }));
    setContacts(prev => prev.map(c => c.peerId === selected ? { ...c, lastMessage: item.text, lastTime: item.timestamp } : c));
    setInput('');
  };

  const addContact = () => {
    if (!addKeyInput.trim() || !addNameInput.trim()) return;
    const peerId = addKeyInput.trim().slice(0, 16);
    if (contacts.find(c => c.peerId === peerId)) { setShowAddContact(false); return; }
    setContacts(prev => [...prev, { peerId, username: addNameInput.trim(), publicKeyHex: addKeyInput.trim(), isOnline: false, unread: 0 }]);
    setShowAddContact(false);
    setAddKeyInput('');
    setAddNameInput('');
  };

  const selectContact = (peerId: string) => {
    setSelected(peerId);
    setContacts(prev => prev.map(c => c.peerId === peerId ? { ...c, unread: 0 } : c));
    setSidebarOpen(false);
  };

  const copyKey = () => {
    if (!identity) return;
    navigator.clipboard.writeText(identity.publicKeyHex);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const filtered = contacts.filter(c => c.username.toLowerCase().includes(search.toLowerCase()));
  const currentContact = contacts.find(c => c.peerId === selected);
  const currentMessages = selected ? (messages[selected] ?? []) : [];

  if (!identity) return <Login />;

  const avatarLetter = (name: string) => name[0]?.toUpperCase() ?? '?';
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Sidebar header */}
        <div className="sidebar-header">
          <div className="user-card">
            <div className="avatar-wrap">
              <div className="avatar-letter">{avatarLetter(identity.username)}</div>
              <div className="online-dot" />
            </div>
            <div className="user-info">
              <div className="user-name">{identity.username}</div>
              <div className="user-addr">{identity.solanaAddress.slice(0, 12)}…</div>
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="Демо шифрования" onClick={() => setView('demo')}>🔐</button>
              <button className="icon-btn" title="Настройки" onClick={() => setView('settings')}>⚙</button>
              <button className="icon-btn" title="Выйти" onClick={logout}>⏏</button>
            </div>
          </div>
          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Поиск…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="add-btn" onClick={() => setShowAddContact(true)} title="Добавить контакт">+</button>
          </div>
        </div>

        {/* Online peers badge */}
        {contacts.filter(c => c.isOnline).length > 0 && (
          <div className="peers-badge">
            <span className="pulse-dot" />
            {contacts.filter(c => c.isOnline).length} peer{contacts.filter(c => c.isOnline).length > 1 ? 's' : ''} online · P2P active
          </div>
        )}

        {/* Contact list */}
        <div className="contact-list">
          {filtered.length === 0 && (
            <div className="empty-contacts">
              <div className="empty-icon">👥</div>
              <div>Откройте вторую вкладку и войдите как другой пользователь</div>
              <div className="empty-sub">Peers обнаруживаются автоматически</div>
            </div>
          )}
          {filtered.map(c => (
            <div
              key={c.peerId}
              className={`contact-item ${c.peerId === selected ? 'active' : ''}`}
              onClick={() => selectContact(c.peerId)}
            >
              <div className="contact-avatar-wrap">
                <div className="contact-avatar">{avatarLetter(c.username)}</div>
                {c.isOnline && <div className="contact-online" />}
              </div>
              <div className="contact-body">
                <div className="contact-top">
                  <span className="contact-name">{c.username}</span>
                  {c.lastTime && <span className="contact-time">{formatTime(c.lastTime)}</span>}
                </div>
                <div className="contact-preview">
                  {c.lastMessage ? (
                    <span className="last-msg">🔒 {c.lastMessage.slice(0, 32)}{c.lastMessage.length > 32 ? '…' : ''}</span>
                  ) : (
                    <span className="no-msg">Начните диалог</span>
                  )}
                  {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <main className="main-area">
        {view === 'demo' ? (
          <CryptoDemo onBack={() => setView('chat')} />
        ) : view === 'settings' ? (
          <SettingsView identity={identity} onBack={() => setView('chat')} onLogout={logout} copyKey={copyKey} copiedKey={copiedKey} />
        ) : !selected ? (
          <div className="welcome-screen">
            <div className="welcome-icon">🔐</div>
            <h2>DM Protocol</h2>
            <p>Децентрализованный мессенджер с end-to-end шифрованием</p>
            <div className="welcome-features">
              <div className="wf-item"><span>X25519 ECDH</span> — обмен ключами</div>
              <div className="wf-item"><span>XSalsa20-Poly1305</span> — шифрование</div>
              <div className="wf-item"><span>Solana</span> — хранение метаданных</div>
              <div className="wf-item"><span>IPFS</span> — хранение сообщений</div>
            </div>
            <div className="my-key-block">
              <div className="my-key-label">Ваш публичный ключ (поделитесь с собеседником):</div>
              <div className="my-key-value" onClick={copyKey}>
                {identity.publicKeyHex}
                <span className="copy-tip">{copiedKey ? '✓' : '📋'}</span>
              </div>
            </div>
            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)}>
              ☰ Список контактов
            </button>
          </div>
        ) : (
          <div className="chat-area">
            {/* Chat header */}
            <div className="chat-header">
              <button className="back-btn" onClick={() => { setSidebarOpen(true); }}>←</button>
              <div className="chat-avatar">{avatarLetter(currentContact?.username ?? '?')}</div>
              <div className="chat-header-info">
                <div className="chat-header-name">{currentContact?.username}</div>
                <div className="chat-header-status">
                  {currentContact?.isOnline
                    ? <><span className="green-dot" /> E2EE · P2P · IPFS</>
                    : <><span className="grey-dot" /> не в сети</>}
                </div>
              </div>
              <div className="chat-header-lock" title="Шифрование активно">🔒</div>
            </div>

            {/* Messages */}
            <div className="messages-area">
              {currentMessages.length === 0 && (
                <div className="no-messages">
                  <div>🔐</div>
                  <div>Сообщения зашифрованы E2EE</div>
                  <div className="no-msg-sub">Начните диалог — никто кроме вас не прочитает</div>
                </div>
              )}
              {currentMessages.map(m => {
                const secsLeft = m.expiresAt ? Math.max(0, Math.ceil((m.expiresAt - now) / 1000)) : null;
                const isUrgent = secsLeft !== null && secsLeft <= 10;
                return (
                  <div key={m.id} className={`msg-row ${m.sender}`}>
                    <div className="bubble-wrap">
                      <div className={`bubble ${isUrgent ? 'expiring' : ''}`}>{m.text}</div>
                      <div className="bubble-meta">
                        <span className="bubble-time">{formatTime(m.timestamp)}</span>
                        {secsLeft !== null && (
                          <span className={`bubble-ttl ${isUrgent ? 'urgent' : ''}`} title="Сообщение самоуничтожится">
                            ⏱ {secsLeft < 60 ? `${secsLeft}с` : secsLeft < 3600 ? `${Math.ceil(secsLeft / 60)}м` : `${Math.ceil(secsLeft / 3600)}ч`}
                          </span>
                        )}
                        <span
                          className="bubble-cid"
                          title={`IPFS CID: ${m.cid}`}
                          onClick={() => setShowRawMsg(showRawMsg === m.id ? null : m.id)}
                        >
                          🌐 IPFS
                        </span>
                        <span className="bubble-e2ee">🔒 E2EE</span>
                      </div>
                      {showRawMsg === m.id && (
                        <div className="raw-msg-panel">
                          <div className="raw-label">CID (IPFS)</div>
                          <div className="raw-value">{m.cid}</div>
                          <div className="raw-label">Зашифровано (Base64, XSalsa20)</div>
                          <div className="raw-value">{m.encryptedB64.slice(0, 64)}…</div>
                          {m.expiresAt && (
                            <>
                              <div className="raw-label">Самоуничтожение</div>
                              <div className="raw-value">{new Date(m.expiresAt).toLocaleString('ru')}</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-bar">
              <div className="input-bar-row">
                <div className="ttl-picker">
                  {TTL_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      className={`ttl-btn ${ttlSeconds === opt.seconds ? 'active' : ''}`}
                      onClick={() => setTtlSeconds(opt.seconds)}
                      title={opt.seconds === 0 ? 'Без удаления' : `Удалить через ${opt.label}`}
                    >
                      {opt.seconds > 0 ? `⏱${opt.label}` : opt.label}
                    </button>
                  ))}
                </div>
                <input
                  className="msg-input"
                  placeholder="Введите сообщение…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                />
                <button className="send-btn" onClick={send} disabled={!input.trim()}>➤</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add contact modal */}
      {showAddContact && (
        <div className="modal-overlay" onClick={() => setShowAddContact(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Добавить контакт</h3>
            <p className="modal-sub">Введите публичный ключ (hex) собеседника</p>
            <input className="modal-input" placeholder="Имя" value={addNameInput} onChange={e => setAddNameInput(e.target.value)} />
            <textarea className="modal-input" placeholder="Публичный ключ (64 hex)" value={addKeyInput} onChange={e => setAddKeyInput(e.target.value)} rows={3} />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddContact(false)}>Отмена</button>
              <button className="btn-primary-sm" onClick={addContact}>Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Settings view ---
interface SettingsViewProps {
  identity: { username: string; publicKeyHex: string; secretKeyHex: string; solanaAddress: string; fingerprint: string };
  onBack: () => void;
  onLogout: () => void;
  copyKey: () => void;
  copiedKey: boolean;
}

const SettingsView: React.FC<SettingsViewProps> = ({ identity, onBack, onLogout, copyKey, copiedKey }) => {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="settings-view">
      <div className="settings-top-bar">
        <button className="back-btn" onClick={onBack}>← Назад</button>
        <h2>Настройки</h2>
      </div>

      <div className="settings-body">
        <div className="settings-section">
          <div className="section-title">Идентификация</div>
          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-label">Имя пользователя</span>
              <span className="settings-value">{identity.username}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Solana адрес</span>
              <span className="settings-value mono solana-addr">{identity.solanaAddress}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">
                <a href={`https://explorer.solana.com/address/${identity.solanaAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="explorer-link">
                  Solana Explorer ↗
                </a>
              </span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Криптографические ключи</div>
          <div className="settings-card">
            <div className="settings-label">Fingerprint публичного ключа</div>
            <div className="fingerprint-display">{identity.fingerprint}</div>

            <div className="settings-label" style={{ marginTop: '1rem' }}>Публичный ключ (X25519)</div>
            <div className="key-display" onClick={copyKey} title="Нажмите, чтобы скопировать">
              {identity.publicKeyHex}
              <span className="copy-badge">{copiedKey ? '✓ скопировано' : '📋'}</span>
            </div>

            <div className="settings-label" style={{ marginTop: '1rem' }}>Приватный ключ</div>
            <div className="key-display secret" onClick={() => setShowSecret(!showSecret)}>
              {showSecret ? identity.secretKeyHex : '•'.repeat(64)}
              <span className="copy-badge">{showSecret ? '🙈 скрыть' : '👁 показать'}</span>
            </div>
            {showSecret && <div className="secret-warning">⚠️ Никогда не передавайте приватный ключ!</div>}
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Блокчейн & IPFS</div>
          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-label">Сеть</span>
              <span className="settings-value tag green">Solana Devnet</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Хранилище</span>
              <span className="settings-value tag blue">IPFS (Helia)</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">P2P протокол</span>
              <span className="settings-value tag blue">libp2p · BroadcastChannel</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Шифрование</span>
              <span className="settings-value tag purple">X25519 + XSalsa20-Poly1305</span>
            </div>
          </div>
        </div>

        <button className="logout-btn" onClick={onLogout}>Выйти из аккаунта</button>
      </div>
    </div>
  );
};

export default App;
