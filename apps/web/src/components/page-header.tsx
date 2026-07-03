import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader(props: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {props.backHref && (
        <Link
          href={props.backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {props.backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
          {props.description && (
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{props.description}</p>
          )}
        </div>
        {props.actions && <div className="flex items-center gap-2">{props.actions}</div>}
      </div>
    </div>
  );
}
