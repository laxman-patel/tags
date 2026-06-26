import { getArtifactById } from "@tags/core/artifacts";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { artifactId } = await params;
  const db = getDb();
  const artifact = await getArtifactById(db, artifactId);
  if (!artifact) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ artifact });
}
