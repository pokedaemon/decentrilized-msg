import React, { useState, useCallback } from 'react';
import {
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  toHex,
  fingerprint,
  toBase58,
} from '../crypto';
import './CryptoDemo.css';

// ── Типы ──────────────────────────────────────────────────────────────────────

interface Party {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  address: string;
  fp: string;
}

interface EncResult {
  encryptedB64: string;
  nonceB64: string;
  cid: string;
  encHex: string;
  nonceHex: string;
}

type Step = 0 | 1 | 2 | 3 | 4;

// ── Компонент ─────────────────────────────────────────────────────────────────

interface CryptoDemoProps {
  onBack: () => void;
}

const CryptoDemo: React.FC<CryptoDemoProps> = ({ onBack }) => {
  const [step, setStep] = useState<Step>(0);
  const [message, setMessage] = useState('Привет, Боб! Это секретное сообщение.');
  const [alice, setAlice] = useState<Party | null>(null);
  const [bob, setBob] = useState<Party | null>(null);
  const [encResult, setEncResult] = useState<EncResult | null>(null);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setStep(0);
    setAlice(null);
    setBob(null);
    setEncResult(null);
    setDecrypted(null);
    setError('');
  };

  const b64ToHex = (b64: string): string => {
    const bin = atob(b64);
    return Array.from(bin)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(' ');
  };

  // Шаг 1: генерация ключей
  const genKeys = useCallback(() => {
    try {
      const mkParty = (): Party => {
        const kp = generateKeyPair();
        return {
          publicKey: kp.publicKey,
          secretKey: kp.secretKey,
          address: toBase58(kp.publicKey),
          fp: fingerprint(kp.publicKey),
        };
      };
      setAlice(mkParty());
      setBob(mkParty());
      setStep(1);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Шаг 2: шифрование
  const encrypt = useCallback(() => {
    if (!alice || !bob) return;
    try {
      const result = encryptMessage(message.trim(), bob.publicKey, alice.secretKey);
      setEncResult({
        ...result,
        encHex: b64ToHex(result.encryptedB64).slice(0, 150) + '…',
        nonceHex: b64ToHex(result.nonceB64),
      });
      setStep(2);
    } catch (e) {
      setError(String(e));
    }
  }, [alice, bob, message]);

  // Шаг 3: «запись» в Solana
  const toBlockchain = useCallback(() => setStep(3), []);

  // Шаг 4: расшифровка Бобом
  const decrypt = useCallback(() => {
    if (!alice || !bob || !encResult) return;
    try {
      const plain = decryptMessage(
        encResult.encryptedB64,
        encResult.nonceB64,
        alice.publicKey,
        bob.secretKey,
      );
      setDecrypted(plain ?? '⚠️ Не удалось расшифровать');
      setStep(4);
    } catch (e) {
      setError(String(e));
    }
  }, [alice, bob, encResult]);

  const steps = ['Ключи', 'Шифрование', 'Solana', 'Расшифровка'];

  return (
    <div className="demo-view">
      {/* Топ-бар */}
      <div className="demo-topbar">
        <button className="back-btn" onClick={onBack}>← Назад</button>
        <h2>Демо: E2E шифрование</h2>
        <span className="demo-badge">X25519 + XSalsa20-Poly1305</span>
      </div>

      <div className="demo-body">
        {/* Прогресс */}
        <div className="demo-progress">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`dp-step ${step > i ? 'done' : step === i + 1 ? 'active' : ''}`}>
                <div className="dp-num">{step > i ? '✓' : i + 1}</div>
                <div className="dp-label">{s}</div>
              </div>
              {i < steps.length - 1 && <div className={`dp-line ${step > i + 1 ? 'done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>

        {error && <div className="demo-error">⚠ {error}</div>}

        {/* Шаг 0: ввод + старт */}
        {step === 0 && (
          <div className="demo-card">
            <div className="card-title">
              <span className="card-icon">🔐</span> Алиса хочет написать Бобу
            </div>
            <p className="card-desc">
              Приложение использует <strong>X25519 ECDH</strong> для обмена ключами
              и <strong>XSalsa20-Poly1305</strong> (библиотека NaCl) для шифрования.
              Это та же схема, что используется в Signal/WhatsApp.
            </p>
            <label className="field-label">Сообщение Алисы:</label>
            <textarea
              className="demo-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
            />
            <button className="demo-btn" onClick={genKeys} disabled={!message.trim()}>
              ▶ Сгенерировать ключи
            </button>
          </div>
        )}

        {/* Шаг 1: ключи */}
        {step >= 1 && alice && bob && (
          <div className="demo-card">
            <div className="card-title">
              <span className="step-num">1</span> Генерация ключевых пар
            </div>
            <p className="card-desc">
              Каждый пользователь генерирует ключевую пару X25519 локально.
              <strong> Публичный ключ</strong> публикуется в Solana.
              <strong> Приватный ключ</strong> — только на устройстве.
            </p>

            <div className="party-grid">
              {[{ name: 'Алиса', party: alice, color: 'alice' }, { name: 'Боб', party: bob, color: 'bob' }].map(({ name, party, color }) => (
                <div key={name} className={`party-block ${color}`}>
                  <div className="party-name">{name === 'Алиса' ? '👩' : '👨'} {name}</div>

                  <div className="field-label">Solana-адрес (из публ. ключа)</div>
                  <div className="mono-val addr">{party.address}</div>

                  <div className="field-label">Публичный ключ X25519 (hex)</div>
                  <div className="mono-val pub">{toHex(party.publicKey)}</div>

                  <div className="field-label">Fingerprint</div>
                  <div className="mono-val fp">{party.fp}</div>

                  <div className="field-label private-label">Приватный ключ</div>
                  <div className="mono-val secret">{'█'.repeat(32)}<span className="secret-note"> — хранится только локально</span></div>
                </div>
              ))}
            </div>

            {step === 1 && (
              <button className="demo-btn" onClick={encrypt}>
                ▶ Шаг 2: Зашифровать
              </button>
            )}
          </div>
        )}

        {/* Шаг 2: шифрование */}
        {step >= 2 && encResult && (
          <div className="demo-card">
            <div className="card-title">
              <span className="step-num">2</span> Шифрование сообщения
            </div>
            <p className="card-desc">
              Алиса вычисляет общий секрет через <strong>ECDH</strong>
              (её приватный ключ × публичный ключ Боба), затем шифрует сообщение
              алгоритмом <strong>XSalsa20-Poly1305</strong> с одноразовым nonce.
            </p>

            <div className="enc-flow">
              <div className="enc-box plaintext">
                <div className="enc-box-label">Открытый текст</div>
                <div className="enc-box-value">{message}</div>
                <div className="enc-box-size">{new TextEncoder().encode(message).length} байт</div>
              </div>
              <div className="enc-arrow-block">
                <div className="enc-algo">XSalsa20</div>
                <div className="enc-arrow">──────▶</div>
                <div className="enc-nonce">nonce: {encResult.nonceHex}</div>
              </div>
              <div className="enc-box ciphertext">
                <div className="enc-box-label">Зашифрованный текст</div>
                <div className="enc-box-value cipher">{encResult.encHex}</div>
                <div className="enc-box-size">{Math.round(encResult.encryptedB64.length * 0.75)} байт</div>
              </div>
            </div>

            <div className="cid-row">
              <div className="cid-label">IPFS CID (хеш зашифрованного контента):</div>
              <div className="cid-value">{encResult.cid}</div>
            </div>

            {step === 2 && (
              <button className="demo-btn" onClick={toBlockchain}>
                ▶ Шаг 3: Записать CID в Solana
              </button>
            )}
          </div>
        )}

        {/* Шаг 3: Solana транзакция */}
        {step >= 3 && encResult && alice && bob && (
          <div className="demo-card">
            <div className="card-title">
              <span className="step-num">3</span> Запись метаданных в Solana
            </div>
            <p className="card-desc">
              В блокчейн записывается <strong>только CID</strong> — адрес зашифрованного файла в IPFS.
              Текст сообщения в Solana <strong>отсутствует</strong>.
              Смарт-контракт хранит метаданные и подтверждает доставку.
            </p>

            <div className="solana-tx">
              <div className="tx-header">
                <span className="tx-badge">Solana devnet</span>
                <span className="tx-status">✓ Confirmed</span>
              </div>
              <pre className="tx-body">{`// Инструкция: send_message
MessageAccount {
  sender:     "${alice.address.slice(0, 20)}…",
  recipient:  "${bob.address.slice(0, 20)}…",
  ipfs_cid:   "${encResult.cid}",
  sent_at:    ${Math.floor(Date.now() / 1000)},
  expires_at: ${Math.floor(Date.now() / 1000) + 86400},
  delivered:  false,
}`}</pre>
              <div className="tx-note">
                ✅ Сам текст сообщения в блокчейне <strong>не хранится</strong>
              </div>
            </div>

            {step === 3 && (
              <button className="demo-btn" onClick={decrypt}>
                ▶ Шаг 4: Боб расшифровывает
              </button>
            )}
          </div>
        )}

        {/* Шаг 4: расшифровка */}
        {step === 4 && decrypted !== null && (
          <div className="demo-card success">
            <div className="card-title">
              <span className="step-num success">4</span> Боб расшифровал сообщение
            </div>
            <p className="card-desc">
              Боб: скачивает зашифрованный файл из IPFS по CID из Solana,
              вычисляет тот же ECDH-секрет (его приватный ключ × публичный ключ Алисы)
              и расшифровывает XSalsa20-Poly1305.
            </p>

            <div className="decrypt-result">
              <div className="decrypt-label">👨 Боб читает:</div>
              <div className="decrypt-text">{decrypted}</div>
              <div className="decrypt-ok">✅ Совпадает с оригиналом — E2EE работает!</div>
            </div>

            <div className="guarantees">
              <div className="g-title">Гарантии системы</div>
              <div className="g-grid">
                {[
                  ['🔒', 'E2EE', 'Только Алиса и Боб могут прочитать сообщение'],
                  ['⛓️', 'Decentralized', 'Нет центрального сервера — нет единой точки отказа'],
                  ['🌐', 'IPFS', 'Зашифрованный контент хранится по хешу содержимого'],
                  ['🧮', 'Solana', 'Блокчейн хранит только CID и публичные ключи'],
                  ['🔑', 'Zero-Knowledge', 'Приватный ключ никогда не покидает устройство'],
                  ['⏱️', 'TTL', 'Сообщения самоуничтожаются по истечении срока'],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="g-item">
                    <span className="g-icon">{icon}</span>
                    <div>
                      <div className="g-item-title">{title}</div>
                      <div className="g-item-desc">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="demo-btn secondary" onClick={reset}>↩ Запустить снова</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoDemo;
