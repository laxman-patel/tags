import { cookies } from "next/headers";

const COOKIE_NAME = "tags_admin";

export function getAdminKey(): string {
  return process.env.TAGS_ADMIN_KEY ?? "dev-admin-key";
}

export async function isAdminAuthorized(request?: Request): Promise<boolean> {
  const key = getAdminKey();
  if (request) {
    const header = request.headers.get("x-tags-admin-key");
    if (header === key) return true;
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME)?.value;
  return cookie === key;
}

export function adminUnauthorizedResponse() {
  return new Response("Unauthorized", { status: 401 });
}
