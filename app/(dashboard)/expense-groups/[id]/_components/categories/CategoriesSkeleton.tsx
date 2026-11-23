import Skeleton from "@/app/components/feedback/Skeleton";

export default function CategoriesSkeleton() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Categories</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { width: "w-28", canDelete: true },
          { width: "w-24", canDelete: true },
          { width: "w-32", canDelete: false },
        ].map(({ width, canDelete }) => (
          <li key={width} className="min-w-0 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
            <Skeleton className={`h-5 max-w-full ${width}`} />
            <Skeleton className="mt-1 h-5 w-20" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(canDelete ? ["Rename", "Delete"] : ["Rename"]).map((label) => (
                <div key={label} className="relative min-h-10 rounded-lg border border-transparent px-4 py-2 text-sm font-medium">
                  <span className="invisible">{label}</span>
                  <Skeleton className="absolute -inset-px rounded-lg" />
                </div>
              ))}
              {!canDelete && (
                <div className="relative basis-full text-xs">
                  <span className="invisible">Move or delete its expenses first to delete this category.</span>
                  <Skeleton className="absolute inset-0 max-w-72" />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
