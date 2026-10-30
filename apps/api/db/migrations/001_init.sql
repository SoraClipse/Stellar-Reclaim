-- SQLite 3 schema. Use a single writer transaction with WAL; never hand out raw write access to untrusted clients.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wallet_challenges (
  network TEXT NOT NULL CHECK(network IN ('testnet', 'public')),
  account TEXT NOT NULL,
  nonce TEXT NOT NULL CHECK(length(nonce) = 64),
  canonical_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  PRIMARY KEY(network, account, nonce)
);
CREATE INDEX IF NOT EXISTS wallet_challenges_expires ON wallet_challenges(expires_at);
CREATE TABLE IF NOT EXISTS recovery_requests (
  digest TEXT PRIMARY KEY CHECK(length(digest) = 64),
  network TEXT NOT NULL CHECK(network IN ('testnet', 'public')),
  transaction_hash TEXT NOT NULL CHECK(length(transaction_hash) = 64),
  operation_index INTEGER NOT NULL CHECK(operation_index >= 0),
  original_sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  nonce TEXT NOT NULL CHECK(length(nonce) = 64),
  canonical_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(network, transaction_hash, operation_index),
  UNIQUE(network, original_sender, nonce)
);
CREATE TABLE IF NOT EXISTS recipient_decisions (
  request_digest TEXT PRIMARY KEY REFERENCES recovery_requests(digest) ON DELETE RESTRICT,
  recipient TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accept', 'decline')),
  signature TEXT NOT NULL,
  signed_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settlement_receipts (
  request_digest TEXT PRIMARY KEY REFERENCES recovery_requests(digest) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK(network IN ('testnet', 'public')),
  transaction_hash TEXT NOT NULL CHECK(length(transaction_hash) = 64),
  operation_index INTEGER NOT NULL CHECK(operation_index >= 0),
  amount_stroops TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(network, transaction_hash, operation_index)
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
