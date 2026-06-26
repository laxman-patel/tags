import { listSchedules, createSchedule } from "@tags/core/schedules";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized(request))) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const schedules = await listSchedules(db, spaceId);
  return Response.json({ schedules });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized(request))) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const body = (await request.json()) as {
    organizationId: string;
    cron: string;
    timezone: string;
    prompt: string;
  };
  const db = getDb();
  const schedule = await createSchedule(db, {
    organizationId: body.organizationId,
    spaceId,
    cron: body.cron,
    timezone: body.timezone,
    prompt: body.prompt,
  });
  return Response.json({ schedule }, { status: 201 });
}
