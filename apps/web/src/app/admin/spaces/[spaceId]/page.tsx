import { redirect } from "next/navigation";

export default async function SpaceOverviewRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/?space=${encodeURIComponent(spaceId)}`);
}
