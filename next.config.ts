import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Build provenance, inlined at build time and surfaced in the footer and
// /api/version so a deployed instance can always be compared with local HEAD.
function buildSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
