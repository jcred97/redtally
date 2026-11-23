import Skeleton from "@/app/components/feedback/Skeleton";

export default function DashboardSkeleton() {
  return (
    <>
      <div className="mb-5">
        <div className="flex h-[46px] w-fit items-center gap-4 rounded-full border border-gray-700 bg-gray-900 px-4">
          <Skeleton className="size-3" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="size-3" />
        </div>
      </div>

      <div className="space-y-4 sm:space-y-5">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 w-24 shrink-0 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-1 h-8 w-32 sm:h-9" />
              <Skeleton className="mt-1 h-4 w-16" />
            </div>
            {["w-20", "w-16"].map((width) => (
              <div key={width}>
                <Skeleton className={`h-4 ${width}`} />
                <Skeleton className="mt-1 h-7 w-24 max-w-full sm:h-8" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-5 h-2 rounded-full" />
        </div>

        <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
          <div className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6 lg:col-start-2 lg:row-start-1">
            <h2 className="text-lg font-semibold">Spending by category</h2>
            <div className="mt-3 divide-y divide-gray-800">
              {["w-4/5", "w-3/5", "w-2/5"].map((width) => (
                <div key={width} className="px-2 py-3">
                  <div className="flex justify-between gap-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className={`mt-2 h-1.5 rounded-full ${width}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6 lg:col-start-1 lg:row-start-1">
            <h2 className="text-lg font-semibold">Spending trend</h2>
            <Skeleton className="mt-1 h-5 w-40" />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
              {["w-16", "w-20"].map((width) => (
                <div key={width}>
                  <Skeleton className={`h-5 ${width}`} />
                  <Skeleton className="mt-1 h-6 w-24" />
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 sm:gap-x-3">
              <div className="flex flex-col justify-between">
                {["w-8", "w-6", "w-4"].map((width) => (
                  <Skeleton key={width} className={`h-3 ${width}`} />
                ))}
              </div>
              <div className="flex h-36 flex-col justify-between sm:h-52 lg:h-60">
                <div className="border-t border-gray-800" />
                <div className="border-t border-gray-800" />
                <div className="border-t border-gray-800" />
              </div>
              <div className="col-start-2 flex justify-between">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-8" />
              </div>
            </div>
            <div className="mt-4 border-t border-gray-800 pt-3">
              <Skeleton className="my-1.5 h-5 w-36" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
