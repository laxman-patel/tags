import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@vercel/connect",
    "@vercel/oidc",
    "@vercel/sandbox",
    "@aws-sdk/client-s3",
    "@opentelemetry/api",
  ],
  transpilePackages: [
    "@tags/core",
    "@tags/connections",
    "@tags/db",
    "@tags/runtime",
    "@tags/sandbox",
    "@tags/slack",
    "@tags/storage",
    "@tags/ui",
  ],
};

export default withWorkflow(nextConfig);
