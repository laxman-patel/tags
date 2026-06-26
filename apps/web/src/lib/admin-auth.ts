import { auth } from "@clerk/nextjs/server";

export async function isAdminAuthorized(): Promise<boolean> {
  const session = await auth();
  return session.userId != null;
}

export function adminUnauthorizedResponse() {
  return new Response("Unauthorized", { status: 401 });
}
