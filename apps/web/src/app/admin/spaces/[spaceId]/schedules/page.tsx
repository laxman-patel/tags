import { redirect } from "next/navigation";

export default async function SpaceSchedulesRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/?space=${encodeURIComponent(spaceId)}&tab=schedules`);
}
