import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

type PostgresClient = ReturnType<typeof postgres>;

const clients = new Map<string, PostgresClient>();
const databases = new Map<string, Db>();

/**
 * Shared Drizzle client per connection string.
 *
 * Callers used to `createDb()` on every Inngest step / MCP request, each
 * opening a fresh `postgres` pool (default max 10) that was never `.end()`'d.
 * Under load that exhausts Neon/Postgres connection slots and crashes the
 * process mid-run (Slack shows "Running opencode" stuck in error).
 */
export function createDb(connectionString: string) {
  const existing = databases.get(connectionString);
  if (existing) return existing;

  // Keep the pool small: Neon free/launch tiers have ~100 slots and several
  // services share them. One process should not reserve dozens of idle conns.
  const max = Number(process.env.DATABASE_POOL_MAX ?? 5);
  const client = postgres(connectionString, {
    max: Number.isFinite(max) && max > 0 ? max : 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
  const db = drizzle(client, { schema });
  clients.set(connectionString, client);
  databases.set(connectionString, db);
  return db;
}

export function createMigrateClient(connectionString: string) {
  return postgres(connectionString, { max: 1 });
}

/** Test helper: drop cached pools so suites can reconfigure. */
export async function resetDbClientsForTests(): Promise<void> {
  const pending = [...clients.values()].map((client) => client.end({ timeout: 5 }));
  clients.clear();
  databases.clear();
  await Promise.allSettled(pending);
}
