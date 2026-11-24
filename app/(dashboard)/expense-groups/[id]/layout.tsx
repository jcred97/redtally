import { Suspense, type ReactNode } from "react";
import { getExpenseGroupOptions } from "@/app/(dashboard)/_lib/expense-groups/queries";
import Skeleton from "@/app/components/feedback/Skeleton";
import ExpenseGroupHeader from "./_components/ExpenseGroupHeader";

async function GroupHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groups = await getExpenseGroupOptions();
  const group = groups.find(({ publicId }) => publicId === id);
  return group ? <ExpenseGroupHeader group={group} groups={groups} /> : null;
}

function GroupHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 pt-6" aria-hidden="true">
      <div className="flex min-h-10 items-center">
        <Skeleton className="h-8 w-44 sm:h-9 sm:w-52" />
      </div>
      <Skeleton className="h-6 w-20 shrink-0" />
    </div>
  );
}

export default function ExpenseGroupLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  return (
    <div className="dashboard-frame flex-1 text-white">
      <Suspense fallback={<GroupHeaderSkeleton />}>
        <GroupHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}
