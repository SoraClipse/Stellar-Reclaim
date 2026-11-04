/**
 * The former in-memory HTTP server is intentionally disabled. It accepted
 * network-unbound wallet challenges and lost user requests across restarts.
 * Run `pnpm api` to use the domain-bound SQLite API in server.mjs.
 * Do not revive this entry point for internet-facing deployments.
 */
throw new Error('Unsafe legacy server disabled. Use pnpm api with RECLAIM_ORIGIN and RECLAIM_DB_PATH.');
