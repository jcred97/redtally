import type { NextConfig } from "next";
import { expenseHistoryQueryKeys } from "./app/(dashboard)/expense-groups/[id]/_lib/expenses/scope";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/spending/:id/export", destination: "/expense-groups/:id/export", permanent: true },
      // An HTTP redirect carries the browser's fragment over before the group page starts streaming.
      ...expenseHistoryQueryKeys.map((key) => ({
        source: "/expense-groups/:id([0-9a-fA-F-]{36})",
        destination: "/expense-groups/:id/expenses",
        has: [{ type: "query" as const, key }],
        missing: [{ type: "query" as const, key: "tab" }],
        permanent: false,
      })),
    ];
  },
  outputFileTracingIncludes: {
    "/expense-groups/*/export": ["./server/pdf/fonts/**/*", "./server/pdf/emoji/**/*"],
  },
};

export default nextConfig;
