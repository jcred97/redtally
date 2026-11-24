import { ViewTransition, type ReactNode } from "react";
import SessionRefresh from "@/app/components/auth/SessionRefresh";
import { requireUser } from "@/app/lib/auth/session";
import DashboardHeader from "./_components/DashboardHeader";
import MainNavigationBoundary from "./_components/MainNavigationBoundary";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <SessionRefresh userId={user.id}>
      <DashboardHeader name={user.name} email={user.email} image={user.image} />
      <ViewTransition update={{ default: "page-fade", "main-navigation": "none" }}>
        <div className="flex flex-1 flex-col">
          <MainNavigationBoundary>{children}</MainNavigationBoundary>
        </div>
      </ViewTransition>
    </SessionRefresh>
  );
}
