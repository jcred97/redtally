"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DashboardUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="alert" className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <p className="font-semibold">Overview unavailable</p>
      <p className="mt-1 text-sm text-gray-300">We couldn’t load your overview. Try again.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="mt-3 min-h-11 rounded-lg border border-gray-700 px-3 text-sm font-medium hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
