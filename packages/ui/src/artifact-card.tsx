export function ArtifactCard(props: {
  title: string;
  kind: string;
  url: string;
  preview?: string;
  contentType?: string | null;
}) {
  const isVideo = props.kind === "video" || props.contentType?.startsWith("video/");

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{props.title}</span>
        <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-xs text-muted-foreground">
          {props.kind}
        </span>
      </div>
      {props.preview && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {props.preview.slice(0, 2000)}
        </pre>
      )}
      {isVideo && (
        <video
          className="mt-3 aspect-video w-full rounded-lg border border-border/60 bg-black"
          controls
          preload="metadata"
          src={props.url}
        />
      )}
      <p className="mt-3 mb-0">
        <a href={props.url} className="text-sm underline-offset-4 hover:underline">
          Open artifact
        </a>
      </p>
    </div>
  );
}
