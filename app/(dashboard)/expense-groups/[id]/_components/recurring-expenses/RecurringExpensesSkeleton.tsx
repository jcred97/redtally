import Skeleton from "@/app/components/feedback/Skeleton";

export default function RecurringExpensesSkeleton() {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">Recurring expenses</h2>
        <div className="relative rounded-lg border border-transparent px-3 py-2 text-sm font-medium">
          <span className="invisible">Run due expenses</span>
          <Skeleton className="absolute -inset-px rounded-lg" />
        </div>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2 [&>li:only-child]:col-span-full">
        {[0, 1].map((row) => (
          <li key={row} className="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-start justify-between gap-4">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-5 w-16 shrink-0" />
            </div>
            <Skeleton className="mt-1 h-5 w-40 max-w-full" />
            <Skeleton className="mt-2 h-5 w-32 max-w-full" />
            <div className="mt-3 flex flex-wrap gap-2">
              {["Edit", "Pause", "Delete"].map((label) => (
                <div key={label} className="relative min-h-10 rounded-lg border border-transparent px-4 py-2 text-sm font-medium">
                  <span className="invisible">{label}</span>
                  <Skeleton className="absolute -inset-px rounded-lg" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
