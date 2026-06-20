import React, { useState, useContext } from 'react';
import { AuthContext } from '../auth/AuthContext';
import { generateKeyPair, toHex, toBase58, fingerprint } from '../crypto';
import './Login.css';

type Step = 'username' | 'generating' | 'ready' | 'import';

interface KeyPreview {
  secretKeyHex: string;
  publicKeyHex: string;
  solanaAddress: string;
  fp: string;
}

export const Login: React.FC = () => {
  const { register } = useContext(AuthContext);
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [importKey, setImportKey] = useState('');
  const [preview, setPreview] = useState<KeyPreview | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!username.trim()) return;
    setStep('generating');
    setTimeout(() => {
      const kp = generateKeyPair();
      setPreview({
        secretKeyHex: toHex(kp.secretKey),
        publicKeyHex: toHex(kp.publicKey),
        solanaAddress: toBase58(kp.publicKey),
        fp: fingerprint(kp.publicKey),
      });
      setStep('ready');
    }, 900);
  };

  const handleImport = () => {
    setError('');
    if (!username.trim() || !importKey.trim()) return;
    try {
      register(username.trim(), importKey.trim());
    } catch {
      setError('Неверный приватный ключ (ожидается 64 hex символа)');
    }
  };

  const handleEnter = () => {
    if (!preview) return;
    register(username.trim(), preview.secretKeyHex);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // --- Generating ---
  if (step === 'generating') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo">🔐</div>
          <h1 className="login-title">DM Protocol</h1>
          <div className="generating-wrap">
            <div className="spinner" />
            <p className="generating-text">Генерирую ключевую пару X25519…</p>
            <p className="generating-sub">ECDH · XSalsa20-Poly1305 · E2EE</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Keys ready ---
  if (step === 'ready' && preview) {
    return (
      <div className="login-bg">
        <div className="login-card wide">
          <div className="login-logo">✅</div>
          <h1 className="login-title">Ключи сгенерированы</h1>
          <p className="login-sub">Поделитесь публичным ключом с собеседником</p>

          <div className="key-section">
            <div className="key-label">Публичный ключ (X25519)</div>
            <div className="key-box" onClick={() => copy(preview.publicKeyHex)}>
              <span className="key-text">{preview.publicKeyHex}</span>
              <span className="copy-hint">{copied ? '✓ скопировано' : 'нажмите, чтобы скопировать'}</span>
            </div>
          </div>

          <div className="key-section">
            <div className="key-label">Solana адрес</div>
            <div className="key-box mono">
              <span className="key-text small">{preview.solanaAddress}</span>
            </div>
          </div>

          <div className="key-section">
            <div className="key-label">Fingerprint</div>
            <div className="fingerprint-box">{preview.fp}</div>
          </div>

          <div className="security-note">
            <span className="lock-icon">🔒</span>
            Приватный ключ хранится только локально и никуда не передаётся
          </div>

          <button className="btn-primary login-enter-btn" onClick={handleEnter}>
            Войти в мессенджер →
          </button>
        </div>
      </div>
    );
  }

  // --- Import ---
  if (step === 'import') {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo">🔑</div>
          <h1 className="login-title">Восстановить аккаунт</h1>
          <p className="login-sub">Введите имя и приватный ключ (hex)</p>

          <input
            className="login-input"
            type="text"
            placeholder="Имя пользователя"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <textarea
            className="login-input key-import-area"
            placeholder="Приватный ключ (64 hex символа)"
            value={importKey}
            onChange={e => setImportKey(e.target.value)}
            rows={3}
          />
          {error && <div className="login-error">{error}</div>}

          <button className="btn-primary" onClick={handleImport}>Восстановить</button>
          <button className="btn-ghost" onClick={() => setStep('username')}>← Назад</button>
        </div>
      </div>
    );
  }

  // --- Default: username input ---
  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">🔐</div>
        <h1 className="login-title">DM Protocol</h1>
        <p className="login-sub">Децентрализованный мессенджер с E2EE</p>

        <div className="feature-list">
          <div className="feature-item"><span>🔑</span> X25519 ECDH шифрование</div>
          <div className="feature-item"><span>⛓️</span> Метаданные в Solana</div>
          <div className="feature-item"><span>🌐</span> Хранение в IPFS</div>
          <div className="feature-item"><span>🔗</span> P2P без серверов</div>
        </div>

        <input
          className="login-input"
          type="text"
          placeholder="Введите имя пользователя"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          autoFocus
        />

        <button className="btn-primary" onClick={handleCreate} disabled={!username.trim()}>
          Создать аккаунт
        </button>
        <button className="btn-ghost" onClick={() => setStep('import')}>
          Уже есть ключ? Восстановить
        </button>
      </div>
    </div>
  );
};
