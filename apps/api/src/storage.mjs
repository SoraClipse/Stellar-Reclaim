import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

/** Durable local SQLite adapter; use a persistent file path in deployments, not :memory:. */
export class RecoveryStorage {
  constructor(filename) {
    if (typeof filename !== 'string' || filename.length === 0) throw new TypeError('SQLite database filename required');
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
    this.db.exec(readFileSync(new URL('../db/migrations/001_init.sql', import.meta.url), 'utf8'));
    if (this.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 1').get().n !== 1) throw Error('Migration not applied');
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  issueChallenge(challenge) {
    this.transaction(() => {
      this.db.prepare('INSERT INTO wallet_challenges(network, account, nonce, canonical_json, expires_at) VALUES(?, ?, ?, ?, ?)')
        .run(challenge.network, challenge.account, challenge.nonce, JSON.stringify(challenge), challenge.expiresAt);
    });
  }

  consumeChallenge(challenge, now) {
    return this.transaction(() => {
      const result = this.db.prepare(`UPDATE wallet_challenges SET consumed_at = ?
        WHERE network = ? AND account = ? AND nonce = ? AND canonical_json = ? AND expires_at > ? AND consumed_at IS NULL`)
        .run(now, challenge.network, challenge.account, challenge.nonce, JSON.stringify(challenge), now);
      return result.changes === 1;
    });
  }

  recordVerifiedRequest(request, digest, signature) {
    return this.transaction(() => {
      try {
        this.db.prepare(`INSERT INTO recovery_requests
          (digest, network, transaction_hash, operation_index, original_sender, recipient, nonce, canonical_json, signature, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(digest, request.network, request.transactionHash, request.operationIndex,
            request.originalSender, request.recipient, request.nonce, JSON.stringify(request), signature, request.expiresAt);
        return true;
      } catch (error) {
        if (error?.code === 'ERR_SQLITE_ERROR' && /^UNIQUE constraint failed: recovery_requests\./.test(error.message)) return false;
        throw error;
      }
    });
  }

  /** Caller MUST verify recipient's domain-bound signature before recording a decision. */
  recordRecipientDecision({digest, recipient, decision, signature, signedAt}) {
    if (!['accept', 'decline'].includes(decision) || !Number.isSafeInteger(signedAt) || !signature) throw new TypeError('Invalid recipient decision');
    return this.transaction(() => this.db.prepare(`INSERT INTO recipient_decisions
      (request_digest, recipient, decision, signature, signed_at) VALUES (?, ?, ?, ?, ?)`)
      .run(digest, recipient, decision, signature, signedAt));
  }

  /** Caller MUST independently check the finalized refund payment before recording a receipt. */
  recordSettlementReceipt({digest, network, transactionHash, operationIndex, amountStroops, verifiedAt}) {
    if (!Number.isSafeInteger(operationIndex) || operationIndex < 0 || !Number.isSafeInteger(verifiedAt) || !/^[1-9][0-9]*$/.test(amountStroops)) throw new TypeError('Invalid receipt');
    return this.transaction(() => this.db.prepare(`INSERT INTO settlement_receipts
      (request_digest, network, transaction_hash, operation_index, amount_stroops, verified_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(digest, network, transactionHash, operationIndex, amountStroops, verifiedAt));
  }

  close() { this.db.close(); }
}
