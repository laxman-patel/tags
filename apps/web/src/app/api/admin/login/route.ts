import { getAdminKey } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { key?: string };
  const expected = getAdminKey();

  if (body.key !== expected) {
    return Response.json({ error: "Invalid key" }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.set(
    "set-cookie",
    `tags_admin=${expected}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  );
  return response;
}
