import type { CSSProperties } from "react";

const card: CSSProperties = {
  border: "1px solid #fcd34d",
  borderRadius: 8,
  padding: 16,
  background: "#fffbeb",
};

export function ApprovalCard(props: {
  toolName: string;
  requestText: string;
  riskLevel: string;
  status: string;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div style={card}>
      <strong>Approval: {props.toolName}</strong>
      <p>{props.requestText}</p>
      <p style={{ fontSize: 13 }}>Risk: {props.riskLevel} · Status: {props.status}</p>
      {props.status === "pending" && props.onApprove && props.onReject && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={props.onApprove}>Approve</button>
          <button type="button" onClick={props.onReject}>Reject</button>
        </div>
      )}
    </div>
  );
}
