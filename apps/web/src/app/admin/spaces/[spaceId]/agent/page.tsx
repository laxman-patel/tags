import { redirect } from "next/navigation";

export default async function SpaceAgentRedirect({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  redirect(`/admin/spaces/${spaceId}/codebase`);
}
