import { redirect } from "next/navigation";

export default async function SpaceAgentRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/?space=${encodeURIComponent(spaceId)}&tab=codebase`);
}
