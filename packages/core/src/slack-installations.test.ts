import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Db } from "@tags/db";
import { workspaces } from "@tags/db";
import {
  SlackWorkspaceAlreadyConnectedError,
  assertWorkspaceConnectable,
  decryptSlackBotToken,
  upsertSlackInstallation,
  type SlackInstallation,
} from "./slack-installations";

type SelectResponse = SlackInstallation[];
type WorkspaceRow = Partial<SlackInstallation> & {
  id: string;
  organizationId: string;
  provider: "slack";
  externalWorkspaceId: string;
};

function workspaceRow(values: Partial<SlackInstallation> & {
  id?: string;
  organizationId?: string;
  externalWorkspaceId?: string;
} = {}): WorkspaceRow {
  return {
    id: values.id ?? "workspace_1",
    organizationId: values.organizationId ?? "org_1",
    provider: "slack",
    externalWorkspaceId: values.externalWorkspaceId ?? "T123",
    name: values.name ?? "Acme",
    botAccessTokenCiphertext: values.botAccessTokenCiphertext ?? "v1:placeholder",
    botRefreshTokenCiphertext: values.botRefreshTokenCiphertext ?? null,
    botTokenExpiresAt: values.botTokenExpiresAt ?? null,
    botUserId: values.botUserId ?? "U_BOT",
    appId: values.appId ?? "A123",
    botScopes: values.botScopes ?? [],
    installedBySlackUserId: values.installedBySlackUserId ?? "U_ADMIN",
    installedByUserId: values.installedByUserId ?? null,
    updatedAt: values.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

class WorkspaceDbDouble {
  rows: WorkspaceRow[] = [];
  private readonly selectResponses: SelectResponse[];

  constructor(selectResponses: SelectResponse[]) {
    this.selectResponses = [...selectResponses];
  }

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => this.selectResponses.shift() ?? [],
        }),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: WorkspaceRow) => {
        if (table === workspaces) this.rows.push({ ...row });
        return { returning: async () => [row] };
      },
    };
  }

  update(table: unknown) {
    return {
      set: (values: Partial<SlackInstallation>) => ({
        where: () => ({
          returning: async () => {
            if (table !== workspaces) return [];
            const existing = this.rows[0] ?? workspaceRow();
            const updated = { ...existing, ...values };
            this.rows[0] = updated;
            return [updated];
          },
        }),
      }),
    };
  }
}

describe("Slack installation helpers", () => {
  const encryptionKey = randomBytes(32).toString("base64");

  it("blocks a Slack workspace that is owned by another organization", async () => {
    const db = new WorkspaceDbDouble([
      [workspaceRow({ organizationId: "org_other", externalWorkspaceId: "T123" }) as SlackInstallation],
      [],
    ]);

    await expect(
      assertWorkspaceConnectable(db as unknown as Db, {
        organizationId: "org_current",
        teamId: "T123",
      }),
    ).rejects.toBeInstanceOf(SlackWorkspaceAlreadyConnectedError);
  });

  it("stores encrypted bot tokens and never returns plaintext ciphertext", async () => {
    const db = new WorkspaceDbDouble([[], [], []]);

    const row = await upsertSlackInstallation(db as unknown as Db, {
      organizationId: "org_1",
      teamId: "T123",
      teamName: "Acme",
      botAccessToken: "xoxb-secret-token",
      botScopes: ["chat:write"],
      encryptionKey,
    });

    expect(row.botAccessTokenCiphertext).toMatch(/^v1:/);
    expect(row.botAccessTokenCiphertext).not.toContain("xoxb-secret-token");
    expect(decryptSlackBotToken(row, encryptionKey)).toBe("xoxb-secret-token");
  });

  it("reinstalling into the same organization updates token and scopes", async () => {
    const existing = workspaceRow({
      id: "workspace_existing",
      organizationId: "org_1",
      externalWorkspaceId: "T123",
      botScopes: ["channels:read"],
    });
    const db = new WorkspaceDbDouble([
      [existing as SlackInstallation],
      [existing as SlackInstallation],
      [existing as SlackInstallation],
    ]);
    db.rows.push(existing);

    const row = await upsertSlackInstallation(db as unknown as Db, {
      organizationId: "org_1",
      teamId: "T123",
      teamName: "Acme Updated",
      botAccessToken: "xoxb-new-token",
      botScopes: ["channels:read", "chat:write"],
      encryptionKey,
    });

    expect(row.id).toBe("workspace_existing");
    expect(row.name).toBe("Acme Updated");
    expect(row.botScopes).toEqual(["channels:read", "chat:write"]);
    expect(decryptSlackBotToken(row, encryptionKey)).toBe("xoxb-new-token");
  });
});
