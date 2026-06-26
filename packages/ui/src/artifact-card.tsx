import type { CSSProperties } from "react";

const card: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: 16,
  background: "#fafafa",
};

export function ArtifactCard(props: {
  title: string;
  kind: string;
  url: string;
  preview?: string;
}) {
  return (
    <div style={card}>
      <strong>{props.title}</strong>
      <p style={{ fontSize: 13, color: "#666" }}>{props.kind}</p>
      {props.preview && (
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 8 }}>{props.preview.slice(0, 2000)}</pre>
      )}
      <p><a href={props.url}>Open artifact</a></p>
    </div>
  );
}
