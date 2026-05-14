import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { Contracts } from "../target/types/contracts";
import { assert } from "chai";

describe("contracts — DM Protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.contracts as Program<Contracts>;
  const authority = provider.wallet as anchor.Wallet;

  // Второй пользователь (Боб) — для тестов P2P
  const bobKeypair = web3.Keypair.generate();

  // PDA аккаунт Алисы
  let aliceUserPda: web3.PublicKey;
  let aliceBump: number;

  // PDA аккаунт Боба
  let bobUserPda: web3.PublicKey;

  // Аккаунт сообщения
  let messageKeypair: web3.Keypair;

  before(async () => {
    // Вычисляем PDA для Алисы
    [aliceUserPda, aliceBump] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), authority.publicKey.toBuffer()],
      program.programId
    );

    // Вычисляем PDA для Боба
    [bobUserPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), bobKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Финансируем кошелёк Боба (нужен SOL для оплаты транзакций)
    const airdropSig = await provider.connection.requestAirdrop(
      bobKeypair.publicKey,
      2 * web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
  });

  // ── register_user ──────────────────────────────────────────────────────────

  describe("register_user", () => {
    it("регистрирует Алису с публичными ключами", async () => {
      const identityKey = Array.from({ length: 32 }, (_, i) => i + 1);
      const signedPreKey = Array.from({ length: 32 }, (_, i) => 255 - i);

      await program.methods
        .registerUser(identityKey, signedPreKey)
        .accounts({
          userAccount: aliceUserPda,
          authority: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      const account = await program.account.userAccount.fetch(aliceUserPda);

      assert.ok(account.owner.equals(authority.publicKey), "owner совпадает");
      assert.deepEqual(Array.from(account.identityPubkey), identityKey, "identity_pubkey совпадает");
      assert.deepEqual(Array.from(account.signedPreKey), signedPreKey, "signed_pre_key совпадает");
      assert.isAbove(account.registeredAt.toNumber(), 0, "registered_at установлен");
      assert.equal(account.messageCount.toNumber(), 0, "message_count = 0");
    });

    it("регистрирует Боба (отдельный signer)", async () => {
      const bobProvider = new anchor.AnchorProvider(
        provider.connection,
        new anchor.Wallet(bobKeypair),
        {}
      );
      const bobProgram = new Program(program.idl, bobProvider) as Program<Contracts>;

      const identityKey = Array.from({ length: 32 }, () => 42);
      const signedPreKey = Array.from({ length: 32 }, () => 99);

      await bobProgram.methods
        .registerUser(identityKey, signedPreKey)
        .accounts({
          userAccount: bobUserPda,
          authority: bobKeypair.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([bobKeypair])
        .rpc();

      const account = await program.account.userAccount.fetch(bobUserPda);
      assert.ok(account.owner.equals(bobKeypair.publicKey));
      assert.equal(account.messageCount.toNumber(), 0);
    });
  });

  // ── send_message ───────────────────────────────────────────────────────────

  describe("send_message", () => {
    it("записывает CID сообщения в блокчейн", async () => {
      messageKeypair = web3.Keypair.generate();
      const cid = "QmTestCid123456789012345678901234567890ABCD12";
      const ttl = new BN(86400); // 24 часа

      await program.methods
        .sendMessage(cid, ttl)
        .accounts({
          messageAccount: messageKeypair.publicKey,
          senderAccount: aliceUserPda,
          recipientAccount: bobUserPda,
          sender: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([messageKeypair])
        .rpc();

      const msg = await program.account.messageAccount.fetch(messageKeypair.publicKey);

      assert.ok(msg.sender.equals(authority.publicKey), "sender корректен");
      assert.ok(msg.recipient.equals(bobKeypair.publicKey), "recipient корректен");
      assert.equal(msg.ipfsCid, cid, "CID сохранён");
      assert.isFalse(msg.delivered, "delivered = false");
      assert.isAbove(msg.sentAt.toNumber(), 0, "sent_at установлен");
      assert.isAbove(msg.expiresAt.toNumber(), msg.sentAt.toNumber(), "expires_at > sent_at");
    });

    it("увеличивает message_count отправителя", async () => {
      const before = await program.account.userAccount.fetch(aliceUserPda);

      const newMsg = web3.Keypair.generate();
      const cid = "QmAnotherTestCid1234567890123456789012345678";

      await program.methods
        .sendMessage(cid, new BN(3600))
        .accounts({
          messageAccount: newMsg.publicKey,
          senderAccount: aliceUserPda,
          recipientAccount: bobUserPda,
          sender: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([newMsg])
        .rpc();

      const after = await program.account.userAccount.fetch(aliceUserPda);
      assert.equal(
        after.messageCount.toNumber(),
        before.messageCount.toNumber() + 1,
        "message_count увеличился на 1"
      );
    });

    it("отклоняет CID длиннее 64 символов", async () => {
      const badMsg = web3.Keypair.generate();
      const longCid = "Q".repeat(65);

      try {
        await program.methods
          .sendMessage(longCid, new BN(3600))
          .accounts({
            messageAccount: badMsg.publicKey,
            senderAccount: aliceUserPda,
            recipientAccount: bobUserPda,
            sender: authority.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([badMsg])
          .rpc();
        assert.fail("Должна быть ошибка");
      } catch (e: unknown) {
        const msg = (e as Error).toString();
        assert.include(msg, "CidTooLong", "ошибка CidTooLong");
      }
    });

    it("отклоняет отрицательный TTL", async () => {
      const badMsg = web3.Keypair.generate();

      try {
        await program.methods
          .sendMessage("QmValidCid", new BN(-1))
          .accounts({
            messageAccount: badMsg.publicKey,
            senderAccount: aliceUserPda,
            recipientAccount: bobUserPda,
            sender: authority.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([badMsg])
          .rpc();
        assert.fail("Должна быть ошибка");
      } catch (e: unknown) {
        const msg = (e as Error).toString();
        assert.include(msg, "InvalidTtl", "ошибка InvalidTtl");
      }
    });

    it("отклоняет TTL больше 7 дней", async () => {
      const badMsg = web3.Keypair.generate();

      try {
        await program.methods
          .sendMessage("QmValidCid", new BN(604_801)) // 7 дней + 1 секунда
          .accounts({
            messageAccount: badMsg.publicKey,
            senderAccount: aliceUserPda,
            recipientAccount: bobUserPda,
            sender: authority.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .signers([badMsg])
          .rpc();
        assert.fail("Должна быть ошибка");
      } catch (e: unknown) {
        const msg = (e as Error).toString();
        assert.include(msg, "TtlTooLong", "ошибка TtlTooLong");
      }
    });
  });

  // ── mark_delivered ─────────────────────────────────────────────────────────

  describe("mark_delivered", () => {
    it("Боб помечает сообщение как доставленное", async () => {
      const bobProvider = new anchor.AnchorProvider(
        provider.connection,
        new anchor.Wallet(bobKeypair),
        {}
      );
      const bobProgram = new Program(program.idl, bobProvider) as Program<Contracts>;

      await bobProgram.methods
        .markDelivered()
        .accounts({
          messageAccount: messageKeypair.publicKey,
          recipient: bobKeypair.publicKey,
        })
        .signers([bobKeypair])
        .rpc();

      const msg = await program.account.messageAccount.fetch(messageKeypair.publicKey);
      assert.isTrue(msg.delivered, "delivered = true");
      assert.isAbove(msg.deliveredAt.toNumber(), 0, "delivered_at установлен");
    });

    it("отклоняет повторную пометку доставки", async () => {
      const bobProvider = new anchor.AnchorProvider(
        provider.connection,
        new anchor.Wallet(bobKeypair),
        {}
      );
      const bobProgram = new Program(program.idl, bobProvider) as Program<Contracts>;

      try {
        await bobProgram.methods
          .markDelivered()
          .accounts({
            messageAccount: messageKeypair.publicKey,
            recipient: bobKeypair.publicKey,
          })
          .signers([bobKeypair])
          .rpc();
        assert.fail("Должна быть ошибка");
      } catch (e: unknown) {
        const msg = (e as Error).toString();
        assert.include(msg, "AlreadyDelivered", "ошибка AlreadyDelivered");
      }
    });

    it("отклоняет попытку чужой пометки (Алиса не является получателем)", async () => {
      const anotherMsg = web3.Keypair.generate();
      const cid = "QmAliceMarkDeliveredTest123456789012345678AB";

      // Отправляем сообщение от Алисы к Бобу
      await program.methods
        .sendMessage(cid, new BN(3600))
        .accounts({
          messageAccount: anotherMsg.publicKey,
          senderAccount: aliceUserPda,
          recipientAccount: bobUserPda,
          sender: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([anotherMsg])
        .rpc();

      // Алиса пытается пометить как доставленное — должна быть ошибка
      try {
        await program.methods
          .markDelivered()
          .accounts({
            messageAccount: anotherMsg.publicKey,
            recipient: authority.publicKey, // Алиса, а не Боб
          })
          .rpc();
        assert.fail("Должна быть ошибка Unauthorized");
      } catch (e: unknown) {
        const msg = (e as Error).toString();
        assert.include(msg, "Unauthorized", "ошибка Unauthorized");
      }
    });
  });

  // ── Структура данных ───────────────────────────────────────────────────────

  describe("account structure", () => {
    it("UserAccount содержит корректные поля", async () => {
      const account = await program.account.userAccount.fetch(aliceUserPda);
      assert.property(account, "owner");
      assert.property(account, "identityPubkey");
      assert.property(account, "signedPreKey");
      assert.property(account, "registeredAt");
      assert.property(account, "messageCount");
    });

    it("MessageAccount содержит корректные поля", async () => {
      const account = await program.account.messageAccount.fetch(messageKeypair.publicKey);
      assert.property(account, "sender");
      assert.property(account, "recipient");
      assert.property(account, "ipfsCid");
      assert.property(account, "sentAt");
      assert.property(account, "expiresAt");
      assert.property(account, "delivered");
      assert.property(account, "deliveredAt");
    });

    it("CID хранится точно без изменений", async () => {
      const newMsg = web3.Keypair.generate();
      const exactCid = "QmExactCidPreservation1234567890123456789ABC";

      await program.methods
        .sendMessage(exactCid, new BN(3600))
        .accounts({
          messageAccount: newMsg.publicKey,
          senderAccount: aliceUserPda,
          recipientAccount: bobUserPda,
          sender: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([newMsg])
        .rpc();

      const account = await program.account.messageAccount.fetch(newMsg.publicKey);
      assert.equal(account.ipfsCid, exactCid, "CID хранится без изменений");
    });
  });
});
