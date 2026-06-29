import { serve } from "inngest/next";
import { inngest, tagsRunFunction } from "@tags/runtime";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [tagsRunFunction],
});
