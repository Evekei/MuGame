import type { NextConfig } from "next";

assertProductionApiBaseUrl();

const nextConfig: NextConfig = {
  output: "export",
  agentRules: false,
  images: {
    unoptimized: true
  },
  transpilePackages: ["@mugame/contracts"]
};

export default nextConfig;

function assertProductionApiBaseUrl() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required for production builds.");
  }
  const hostname = new URL(value).hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not point to localhost in production builds.");
  }
}
