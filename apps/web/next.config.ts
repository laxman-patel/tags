import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@opentelemetry/api",
    "@composio/core",
    "@ai-sdk/mcp",
    "e2b",
    "semver",
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

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
