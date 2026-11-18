"use client";

import { useEffect, type ReactNode } from "react";
import { authClient } from "@/app/lib/auth/client";
import LoadingScreen from "@/app/components/feedback/LoadingScreen";

export default function SessionRefresh({ userId, children }: { userId: string; children: ReactNode }) {
  const { data, error, isPending, isRefetching } = authClient.useSession();
  const confirmed = !isPending && !isRefetching && (!error || error.status === 401);
  const destination = confirmed && data?.user.id !== userId ? (data ? "/" : "/sign-in") : null;

  useEffect(() => {
    // A fresh document discards cached routes and drafts belonging to the previous account.
    if (destination) window.location.replace(destination);
  }, [destination]);

  return destination ? <LoadingScreen message="Updating your session..." /> : children;
}
