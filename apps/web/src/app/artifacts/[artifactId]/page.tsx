import { getArtifactById, resolveArtifactBody } from "@tags/core/artifacts";
import { ArtifactCard } from "@tags/ui";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { fetchArtifactBodyFromR2 } from "@/lib/r2";
import { PageHeader } from "@/components/page-header";

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
    return (
      <main className="mx-auto w-full max-w-[800px] px-6 py-8">
        <PageHeader title="Artifact not found" backHref="/" backLabel="Home" />
      </main>
    );
  }

  const env = getEnv();
  const { body, unavailable } = await resolveArtifactBody(artifact, async (contentRef) => {
    return await fetchArtifactBodyFromR2(env, contentRef);
  });

  return (
    <main className="mx-auto w-full max-w-[800px] px-6 py-8">
      <PageHeader title={artifact.title} description={artifact.kind} backHref="/" backLabel="Home" />
      <ArtifactCard
        title={artifact.title}
        kind={artifact.kind}
        url={artifact.url}
        preview={body ?? undefined}
        contentType={artifact.contentType}
      />
      {body != null && (
        <article className="mt-6 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed whitespace-pre-wrap">
          {body}
        </article>
      )}
      {unavailable && <p className="mt-6 text-sm text-muted-foreground">Body unavailable</p>}
    </main>
  );
}
