import Skeleton from "@/app/components/feedback/Skeleton";

export default function ExpenseGroupSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 text-white">
      <p role="status" className="sr-only">
        Loading expense group...
      </p>

      <header className="pt-6" aria-hidden="true">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-44 sm:h-9 sm:w-52" />
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-1 border-b border-gray-800 sm:mt-6 sm:gap-4">
          <div className="flex flex-wrap text-sm font-medium text-gray-400">
            <span className="px-2.5 py-3 sm:px-4">Expenses</span>
            <span className="px-2.5 py-3 sm:px-4">Categories</span>
            <span className="px-2.5 py-3 sm:px-4">Banks</span>
            <span className="px-2.5 py-3 sm:px-4">Recurring</span>
          </div>
          <div className="ml-auto pb-2">
            <Skeleton className="h-8 w-24 rounded-lg sm:h-9 sm:w-32" />
          </div>
        </div>
      </header>

      <main className="py-6 sm:py-8">
        <div
          aria-hidden="true"
          className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end"
        >
          {["w-12", "w-16", "w-24", "w-10"].map((width) => (
            <div key={width}>
              <Skeleton className={`h-5 ${width}`} />
              <Skeleton className="mt-1 h-10 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-10 w-28 rounded-lg sm:col-span-2 lg:col-span-1" />
        </div>
        <div aria-hidden="true" className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex items-center justify-between gap-4 border-y border-gray-800 bg-gray-800/55 px-4 py-3 sm:px-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="divide-y divide-gray-800">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-4 w-52 max-w-full" />
                </div>
                <Skeleton className="hidden h-4 w-20 sm:block" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-2 w-4" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
