import Skeleton from "@/app/components/feedback/Skeleton";

export default function ExpensesSkeleton() {
  return (
    <>
      <div className="mb-6 grid gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:grid-cols-2 md:grid-cols-3">
        {["w-28", "w-12", "w-24", "w-16", "w-32", "w-36"].map((width) => (
          <div key={width}>
            <Skeleton className={`h-5 ${width}`} />
            <Skeleton className="mt-1 h-10 rounded-lg" />
          </div>
        ))}
        <div className="col-span-full border-t border-gray-800 pt-3">
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold sm:mr-auto">Expenses</h2>
        <Skeleton className="h-10 w-44 rounded-lg sm:order-last" />
        <div className="flex flex-wrap gap-2 max-sm:basis-full">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-2 h-5 w-44" />
      <div className="space-y-3 sm:hidden">
        {[0, 1, 2].map((row) => (
          <div key={row} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="mt-2 h-5 w-2/3" />
            <Skeleton className="mt-3 ml-auto h-9 w-16 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="hidden space-y-1.5 sm:block">
        <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_2.25rem] gap-4 border-b border-gray-800 px-4 py-4">
          {Array.from({ length: 6 }, (_, column) => <Skeleton key={column} className="h-4" />)}
        </div>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="grid grid-cols-[repeat(6,minmax(0,1fr))_2.25rem] items-center gap-4 rounded-xl bg-gray-900 px-4 py-4">
            {Array.from({ length: 6 }, (_, column) => <Skeleton key={column} className="h-5" />)}
            <Skeleton className="h-2 w-4 justify-self-center" />
          </div>
        ))}
      </div>
    </>
  );
}
