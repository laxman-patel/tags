import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "tags" });

export const RUN_REQUESTED_EVENT = "tags/run.requested" as const;
export const APPROVAL_RESOLVED_EVENT = "tags/approval.resolved" as const;
