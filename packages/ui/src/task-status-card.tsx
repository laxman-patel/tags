import type { CSSProperties } from "react";

const card: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};

export function TaskStatusCard(props: {
  status: string;
  modelId: string;
  startedAt?: string;
  finishedAt?: string;
}) {
  return (
    <div style={card}>
      <strong>Run status</strong>
      <p>Status: {props.status}</p>
      <p>Model: {props.modelId}</p>
      {props.startedAt && <p>Started: {props.startedAt}</p>}
      {props.finishedAt && <p>Finished: {props.finishedAt}</p>}
    </div>
  );
}
