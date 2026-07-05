import { redirect } from "next/navigation";

export default async function SpaceMemoryRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/?space=${encodeURIComponent(spaceId)}&tab=memory`);
}
