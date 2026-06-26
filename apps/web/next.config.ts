import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tags/core",
    "@tags/db",
    "@tags/runtime",
    "@tags/slack",
    "@tags/ui",
  ],
};

export default withWorkflow(nextConfig);
