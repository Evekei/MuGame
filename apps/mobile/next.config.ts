import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  agentRules: false,
  images: {
    unoptimized: true
  },
  transpilePackages: ["@mugame/contracts"]
};

export default nextConfig;
