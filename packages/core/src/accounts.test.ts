import { describe, expect, it } from "vitest";
import type { Db } from "@tags/db";
import {
  approvalPolicies,
  budgetPolicies,
  memoryPolicies,
  organizations,
  users,
} from "@tags/db";
import { resolveOrCreateClerkAccount } from "./accounts";

type AnyRow = Record<string, unknown>;

class AccountDbDouble {
  organization: AnyRow | null = null;
  user: AnyRow | null = null;
  approvalPolicyRows: AnyRow[] = [];
  budgetPolicyRows: AnyRow[] = [];
  memoryPolicyRows: AnyRow[] = [];

  select() {
    return {
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () =>
              this.user && this.organization
                ? [{ user: this.user, organization: this.organization }]
                : [],
          }),
        }),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: AnyRow) => {
        if (table === organizations) this.organization = { ...row };
        if (table === users) this.user = { ...row };
        if (table === approvalPolicies) this.approvalPolicyRows.push({ ...row });
        if (table === budgetPolicies) this.budgetPolicyRows.push({ ...row });
        if (table === memoryPolicies) this.memoryPolicyRows.push({ ...row });
        return { returning: async () => [row] };
      },
    };
  }

  update(table: unknown) {
    return {
      set: (values: AnyRow) => ({
        where: async () => {
          if (table === organizations && this.organization) {
            this.organization = { ...this.organization, ...values };
          }
        },
      }),
    };
  }
}

describe("resolveOrCreateClerkAccount", () => {
  it("creates one organization, owner user, and default policies for a new Clerk user", async () => {
    const db = new AccountDbDouble();

    const account = await resolveOrCreateClerkAccount(db as unknown as Db, {
      id: "user_clerk_1",
      fullName: "Ada Lovelace",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
    });

    expect(account.organization.name).toBe("Ada Lovelace's Tags");
    expect(account.user.role).toBe("owner");
    expect(account.user.externalProvider).toBe("clerk");
    expect(account.user.externalUserId).toBe("user_clerk_1");
    expect(db.approvalPolicyRows).toHaveLength(1);
    expect(db.budgetPolicyRows).toHaveLength(1);
    expect(db.memoryPolicyRows).toHaveLength(1);
    expect(account.organization.budgetPolicyId).toBe(db.budgetPolicyRows[0]?.id);
  });

  it("returns the existing account on repeated calls", async () => {
    const db = new AccountDbDouble();

    const first = await resolveOrCreateClerkAccount(db as unknown as Db, {
      id: "user_clerk_repeat",
      username: "repeat-user",
    });
    const second = await resolveOrCreateClerkAccount(db as unknown as Db, {
      id: "user_clerk_repeat",
      username: "repeat-user",
    });

    expect(second.organization.id).toBe(first.organization.id);
    expect(second.user.id).toBe(first.user.id);
    expect(db.approvalPolicyRows).toHaveLength(1);
    expect(db.budgetPolicyRows).toHaveLength(1);
    expect(db.memoryPolicyRows).toHaveLength(1);
  });
});
