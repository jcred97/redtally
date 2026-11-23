import Skeleton from "@/app/components/feedback/Skeleton";

export default function CategoriesSkeleton() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Categories</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {["w-28", "w-24", "w-32"].map((width) => (
          <div key={width} className="min-w-0 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <Skeleton className={`h-5 ${width}`} />
            <Skeleton className="mt-1 h-5 w-20" />
            <Skeleton className="mt-3 h-10 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </>
  );
}
