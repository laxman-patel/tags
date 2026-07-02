import { sql } from "drizzle-orm";
import type postgres from "postgres";
import type { Db } from "./client";

export type RlsScope = {
  organizationId: string;
  spaceId: string;
  role?: "member" | "admin";
};

export async function withDbRlsScope<T>(
  db: Db,
  scope: RlsScope,
  fn: (scopedDb: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('tags.organization_id', ${scope.organizationId}, true)`);
    await tx.execute(sql`select set_config('tags.space_id', ${scope.spaceId}, true)`);
    await tx.execute(sql`select set_config('tags.role', ${scope.role ?? "member"}, true)`);
    return fn(tx as Db);
  });
}

export async function setRlsScope(
  sql: postgres.Sql,
  scope: RlsScope,
): Promise<void> {
  await sql`select set_config('tags.organization_id', ${scope.organizationId}, true)`;
  await sql`select set_config('tags.space_id', ${scope.spaceId}, true)`;
  await sql`select set_config('tags.role', ${scope.role ?? "member"}, true)`;
}

export async function withRlsScope<T>(
  sql: postgres.Sql,
  scope: RlsScope,
  fn: () => Promise<T>,
): Promise<T> {
  await sql`begin`;
  try {
    await setRlsScope(sql, scope);
    const result = await fn();
    await sql`commit`;
    return result;
  } catch (error) {
    await sql`rollback`;
    throw error;
  }
}
