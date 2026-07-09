import { describe, expect, it, afterEach } from "vitest";
import { createDb, resetDbClientsForTests } from "./client";

describe("createDb", () => {
  afterEach(async () => {
    await resetDbClientsForTests();
  });

  it("reuses one drizzle client per connection string", () => {
    const url = "postgresql://tags:tags@127.0.0.1:5432/tags_pool_test";
    const a = createDb(url);
    const b = createDb(url);
    expect(a).toBe(b);
  });

  it("keeps separate clients for different connection strings", () => {
    const a = createDb("postgresql://tags:tags@127.0.0.1:5432/tags_a");
    const b = createDb("postgresql://tags:tags@127.0.0.1:5432/tags_b");
    expect(a).not.toBe(b);
  });
});
