import type { ReactNode } from "react";
import SessionRefresh from "@/app/components/auth/SessionRefresh";
import { requireUser } from "@/app/lib/auth/session";
import DashboardHeader from "./_components/DashboardHeader";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <SessionRefresh userId={user.id}>
      <DashboardHeader name={user.name} email={user.email} image={user.image} />
      {children}
    </SessionRefresh>
  );
}
