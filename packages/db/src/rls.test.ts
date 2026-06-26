import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createMigrateClient, newId, setRlsScope } from "@tags/db";

const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? "postgresql://tags:tags@localhost:5433/tags";
const APP_URL =
  process.env.DATABASE_URL ?? "postgresql://tags_app:tags_app@localhost:5433/tags";

describe("RLS space isolation", () => {
  const adminSql = createMigrateClient(MIGRATE_URL);
  const appSql = createMigrateClient(APP_URL);

  const orgId = newId();
  const workspaceId = newId();
  const spaceAId = newId();
  const spaceBId = newId();
  const threadAId = newId();
  const threadBId = newId();
  const workspaceExternalId = `T${newId().replace(/-/g, "")}`;

  beforeAll(async () => {
    await adminSql`
      insert into organizations (id, name) values (${orgId}, 'RLS Test Org')
    `;
    await adminSql`
      insert into workspaces (id, organization_id, provider, external_workspace_id, name)
      values (${workspaceId}, ${orgId}, 'slack', ${workspaceExternalId}, 'RLS Workspace')
    `;
    await adminSql`
      insert into spaces (id, organization_id, workspace_id, provider, external_space_id, name, slug)
      values (${spaceAId}, ${orgId}, ${workspaceId}, 'slack', 'C_SPACE_A', 'space-a', ${`space-a-${spaceAId.slice(0, 6)}`})
    `;
    await adminSql`
      insert into spaces (id, organization_id, workspace_id, provider, external_space_id, name, slug)
      values (${spaceBId}, ${orgId}, ${workspaceId}, 'slack', 'C_SPACE_B', 'space-b', ${`space-b-${spaceBId.slice(0, 6)}`})
    `;
    await adminSql`
      insert into threads (id, organization_id, space_id, provider_thread_id, root_message_id)
      values (${threadAId}, ${orgId}, ${spaceAId}, '1.0', '1.0')
    `;
    await adminSql`
      insert into threads (id, organization_id, space_id, provider_thread_id, root_message_id)
      values (${threadBId}, ${orgId}, ${spaceBId}, '2.0', '2.0')
    `;
    await adminSql`
      insert into messages (id, organization_id, space_id, thread_id, provider_message_id, author_type, author_id, text)
      values (${newId()}, ${orgId}, ${spaceAId}, ${threadAId}, '1.1', 'human', 'U1', 'message in space A')
    `;
    await adminSql`
      insert into messages (id, organization_id, space_id, thread_id, provider_message_id, author_type, author_id, text)
      values (${newId()}, ${orgId}, ${spaceBId}, ${threadBId}, '2.1', 'human', 'U2', 'message in space B')
    `;
  });

  afterAll(async () => {
    await adminSql.end();
    await appSql.end();
  });

  it("returns only messages for the scoped space even when querying another space_id", async () => {
    await appSql`begin`;
    await setRlsScope(appSql, {
      organizationId: orgId,
      spaceId: spaceAId,
      role: "member",
    });

    const rows = await appSql`
      select id, space_id, text from messages where space_id = ${spaceBId}
    `;

    await appSql`rollback`;

    expect(rows).toHaveLength(0);
  });

  it("admin role can read across spaces in the same org", async () => {
    await appSql`begin`;
    await setRlsScope(appSql, {
      organizationId: orgId,
      spaceId: spaceAId,
      role: "admin",
    });

    const rows = await appSql`
      select id, space_id, text from messages
      where organization_id = ${orgId}
    `;

    await appSql`rollback`;

    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
