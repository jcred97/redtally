import Skeleton from "@/app/components/feedback/Skeleton";

export default function RecurringExpensesSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">Recurring expenses</h2>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((row) => (
          <div key={row} className="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-start justify-between gap-4">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="mt-1 h-5 w-40" />
            <Skeleton className="mt-2 h-5 w-32" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-16 rounded-lg" />
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
