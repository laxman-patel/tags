import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMigrateClient } from "./client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../migrations");

async function migrate() {
  const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_MIGRATE_URL or DATABASE_URL is required");
  }

  const sql = createMigrateClient(url);

  await sql`create extension if not exists pg_trgm`;

  await sql`
    create table if not exists _tags_migrations (
      id serial primary key,
      name text not null unique,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set(
    (await sql<{ name: string }[]>`select name from _tags_migrations`).map(
      (r) => r.name,
    ),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await sql.unsafe(content);
    await sql`insert into _tags_migrations (name) values (${file})`;
    console.log(`Applied ${file}`);
  }

  await sql.end();
  console.log("Migrations complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
