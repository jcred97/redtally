import Skeleton from "@/app/components/feedback/Skeleton";

export default function ExpenseGroupSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 text-white sm:px-6">
      <p role="status" className="sr-only">
        Loading expense group...
      </p>

      <header className="pt-6" aria-hidden="true">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-44 sm:h-9 sm:w-52" />
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
        <div className="mt-4 sm:mt-6 lg:grid lg:grid-cols-[1fr_auto] lg:gap-6 lg:border-b lg:border-gray-800">
          <div className="flex flex-wrap border-b border-gray-800 text-sm font-medium text-gray-400 lg:min-h-14 lg:border-b-0">
            {["Dashboard", "Expenses", "Recurring", "Categories", "Payment Provider"].map((label) => (
              <span key={label} className="-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-2.5 sm:px-4">{label}</span>
            ))}
          </div>
          <div className="mt-3 flex justify-end lg:my-2 lg:self-center">
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </header>

      <main className="py-6 sm:py-8">
        <div
          aria-hidden="true"
          className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.25fr)_minmax(0,1fr)]"
        >
          {["w-12", "w-14", "w-16", "w-24", "w-10"].map((width) => (
            <div key={width}>
              <Skeleton className={`h-5 ${width}`} />
              <Skeleton className="mt-1 h-10 w-full rounded-lg" />
            </div>
          ))}
          <div className="col-span-full flex items-center justify-between gap-5 border-t border-gray-800 pt-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
        <div aria-hidden="true" className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-lg font-semibold sm:mr-auto">Expenses</span>
          <Skeleton className="h-10 w-44 rounded-lg sm:order-last" />
          <div className="flex flex-wrap gap-2 max-sm:basis-full">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <Skeleton className="mb-2 h-5 w-44" />

        <div aria-hidden="true">
          <div aria-hidden="true" className="space-y-3 sm:hidden">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-800 bg-gray-900 p-4"
              >
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="mt-2 h-5 w-2/3" />
                <div className="mt-3 flex justify-end">
                  <Skeleton className="h-9 w-16 rounded-lg" />
                </div>
              </div>
            ))}
          </div>

          <div
            aria-hidden="true"
            className="hidden space-y-1.5 sm:block"
          >
            <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_2.25rem] gap-4 border-b border-gray-800 px-4 py-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="grid grid-cols-[repeat(6,minmax(0,1fr))_2.25rem] items-center gap-4 rounded-xl bg-gray-900 px-4 py-4"
              >
                {Array.from({ length: 6 }, (_, column) => (
                  <Skeleton key={column} className="h-5 w-full" />
                ))}
                <Skeleton className="justify-self-center h-2 w-4" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
