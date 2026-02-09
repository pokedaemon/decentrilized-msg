# Схемы
## Криптографическая схема
```
1. Регистрация пользователя:
   ┌─────────────────────────────────────┐
   │ Пользователь создает:               │
   │ - Identity Key Pair (долгосрочный)  │
   │ - Signed Pre Key (обновляемый)      │
   │ - One-Time Pre Keys (куча штук)     │
   └─────────────────────────────────────┘
                    ↓
   Публичные ключи → Solana blockchain
   Приватные ключи → локально (НИКОГДА не отправляются!)

2. Отправка первого сообщения (установка сессии):
   Алиса хочет написать Бобу
   
   Алиса:
   ┌──────────────────────────────────────────┐
   │ 1. Скачивает публичные ключи Боба        │
   │    из Solana                             │
   │ 2. Делает ECDH (Elliptic Curve           │
   │    Diffie-Hellman) - магия математики,   │
   │    которая создает общий секрет          │
   │ 3. Из этого секрета делает Session Key   │
   │ 4. Шифрует сообщение AES-256-GCM         │
   │ 5. Отправляет через IPFS                 │
   └──────────────────────────────────────────┘

3. Последующие сообщения:
   Используем Double Ratchet Algorithm
   (как в Signal/WhatsApp)
   
   ┌─────────────────────────────────────┐
   │ Каждое сообщение = новый ключ!      │
   │ Forward Secrecy: если ключ украли,  │
   │ старые сообщения все равно в тайне  │
   └─────────────────────────────────────┘
```
## Взаимодействие компонентов
```
┌────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │ React UI (Renderer)                                │    │
│  │ - Список чатов                                     │    │
│  │ - Окно чата                                        │    │
│  │ - Настройки                                        │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │ IPC                              │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │ Main Process                                       │    │
│  │                                                    │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐   │    │
│  │  │ @core       │  │ @crypto      │  │ @p2p     │   │    │
│  │  │ - Types     │  │ - Keys       │  │ - libp2p │   │    │
│  │  │ - Utils     │  │ - Encrypt    │  │ - IPFS   │   │    │
│  │  │ - Store     │  │ - Signatures │  │ - PubSub │   │    │
│  │  └─────────────┘  └──────────────┘  └──────────┘   │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │ @blockchain                                  │  │    │
│  │  │ - Solana SDK                                 │  │    │
│  │  │ - Program interface                          │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                         │
                         │ RPC calls
                         ▼
        ┌────────────────────────────────┐
        │   Solana Blockchain (devnet)   │
        │                                │
        │  Smart Contract:               │
        │  - User accounts               │
        │  - Message metadata            │
        │  - Delivery receipts           │
        └────────────────────────────────┘
                         │
                         │
        ┌────────────────▼───────────────┐
        │         IPFS Network           │
        │                                │
        │     Encrypted messages         │
        │  (content-addressed storage)   │
        └────────────────────────────────┘
                         │
                         │ libp2p connections
                         ▼
        ┌────────────────────────────────┐
        │      Other Peers (Users)       │
        │                                │
        │  Alice       Bob        Eve    │
        └────────────────────────────────┘
```
## Взаимодействие с IPFS
```
1. Алиса шифрует сообщение:
   plaintext = "Привет, Боб!"
   encrypted = encrypt(plaintext, sessionKey)
   
2. Добавляет в IPFS:
   cid = await ipfs.add(encrypted)
   // CID = QmX7gD8... (hash содержимого)
   
3. Записывает CID в Solana:
   sendMessageToBlockchain(bob_address, cid, ttl)
   
4. Боб получает уведомление из Solana:
   "Тебе сообщение! CID = QmX7gD8..."
   
5. Боб скачивает из IPFS:
   encrypted = await ipfs.cat(cid)
   
6. Боб расшифровывает:
   plaintext = decrypt(encrypted, sessionKey)
```
## Пример отправки сообщения:
```
1. Алиса вводит текст и нажимает "Отправить"
   ↓
2. Renderer → Main process (IPC)
   ↓
3. Проверка: есть ли уже сессия с Бобом?
   НЕТ → Инициализация сессии:
         - Запросить публичные ключи Боба из Solana
         - Сгенерировать ephemeral key pair
         - Вычислить shared secret (ECDH)
         - Создать session key
   ДА → Использовать существующий session key
   ↓
4. Шифрование:
   message = {
     type: 'text',
     content: 'Привет!',
     timestamp: Date.now(),
     nonce: randomBytes(24)
   }
   encrypted = AES-GCM.encrypt(JSON.stringify(message), sessionKey)
   ↓
5. Добавление в IPFS:
   cid = await ipfs.add(encrypted)
   await ipfs.pin.add(cid)  // закрепить у себя
   ↓
6. Отправка метаданных в Solana:
   await solanaProgram.methods
     .sendMessage(cid, ttl)
     .accounts({
       sender: aliceAccount,
       recipient: bobAccount,
       messageMetadata: newAccount,
     })
     .rpc()
   ↓
7. Отправка через P2P (если Боб онлайн):
   await libp2p.pubsub.publish(`messages/${bobPeerId}`, {
     type: 'new_message',
     cid,
     sender: alicePeerId
   })
   ↓
8. Сохранение в локальную БД:
   await db.messages.add({
     id: messageId,
     chatId: bobId,
     text: 'Привет!',
     status: 'sent',
     timestamp: Date.now(),
     expiresAt: Date.now() + ttl,
     cid
   })
   ↓
9. Обновление UI:
   store.addMessage(chatId, message)
```
## Пример получения сообщения:
```
1. Боб получает уведомление:
   ВАРИАНТ А: Через PubSub (если онлайн)
              libp2p.pubsub.on('messages/${bobPeerId}', handler)
   
   ВАРИАНТ Б: Polling Solana (если был оффлайн)
              setInterval(() => checkNewMessages(), 5000)
   ↓
2. Скачивание из IPFS:
   encrypted = await ipfs.cat(cid)
   ↓
3. Расшифровка:
   decrypted = AES-GCM.decrypt(encrypted, sessionKey)
   message = JSON.parse(decrypted)
   ↓
4. Проверка TTL:
   if (Date.now() > message.timestamp + ttl) {
     // Сообщение устарело, удалить
     return;
   }
   ↓
5. Сохранение в БД:
   await db.messages.add({...message, status: 'received'})
   ↓
6. Отметка "доставлено" в Solana:
   await solanaProgram.methods
     .markDelivered(messageMetadataAccount)
     .rpc()
   ↓
7. Запуск таймера самоуничтожения:
   setTimeout(() => deleteMessage(messageId), ttl)
   ↓
8. Показать в UI:
   store.addMessage(chatId, message)
   showNotification('Новое сообщение от Алисы')
```
