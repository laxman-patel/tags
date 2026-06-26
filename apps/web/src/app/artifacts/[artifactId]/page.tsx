import { getArtifactById } from "@tags/core/artifacts";
import { ArtifactCard } from "@tags/ui";
import Link from "next/link";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  const db = getDb();
  const artifact = await getArtifactById(db, artifactId);

  if (!artifact) {
    return <main style={{ padding: 24 }}>Artifact not found</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/">← Home</Link></p>
      <ArtifactCard
        title={artifact.title}
        kind={artifact.kind}
        url={artifact.url}
        preview={artifact.body ?? undefined}
      />
      {artifact.body && (
        <article style={{ marginTop: 24, whiteSpace: "pre-wrap" }}>{artifact.body}</article>
      )}
    </main>
  );
}
