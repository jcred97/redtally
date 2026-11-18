import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/spending/*/export": ["./server/pdf/fonts/**/*", "./server/pdf/emoji/**/*"],
  },
};

export default nextConfig;
