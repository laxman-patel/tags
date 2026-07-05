import { redirect } from "next/navigation";

export default async function SpaceCodebaseRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/?space=${encodeURIComponent(spaceId)}&tab=codebase`);
}
