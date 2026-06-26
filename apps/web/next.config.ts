import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tags/core",
    "@tags/db",
    "@tags/runtime",
    "@tags/slack",
  ],
};

export default withWorkflow(nextConfig);
