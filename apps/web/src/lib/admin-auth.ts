import { auth, clerkClient } from "@clerk/nextjs/server";
import { getEnv } from "@/env";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function isAdminAuthorized(): Promise<boolean> {
  const { userId, has } = await auth();
  if (!userId) return false;

  if (has({ role: "org:admin" })) return true;

  const env = getEnv();
  const adminUserIds = parseCsv(env.ADMIN_USER_IDS);
  if (adminUserIds.includes(userId)) return true;

  const adminEmails = parseCsv(env.ADMIN_EMAILS).map((email) => email.toLowerCase());
  if (adminEmails.length > 0) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userEmails = user.emailAddresses.map((address) =>
      address.emailAddress.toLowerCase(),
    );
    if (userEmails.some((email) => adminEmails.includes(email))) return true;
  }

  return false;
}

export function adminUnauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
