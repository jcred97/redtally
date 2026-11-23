import { useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/feedback/Skeleton";
import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";

export default function PaymentProvidersSkeleton() {
  const providers = useSearchParams().getAll("provider");
  const payLater = providers.length === 1 && providers[0] === "pay-later";

  return (
    <>
      <div className="mb-6 inline-flex gap-0.5 rounded-lg border border-gray-800 p-0.5 text-sm font-medium text-gray-400">
        <span className="inline-flex min-h-11 items-center rounded-md px-3">Banks</span>
        <span className="inline-flex min-h-11 items-center rounded-md px-3">Pay Later</span>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{payLater ? "Pay Later" : "Banks"}</h2>
        {payLater && <Skeleton className="h-10 w-28 rounded-lg" />}
      </div>
      <div className={settingsTileGridClass}>
        {["w-28", "w-24", "w-32"].map((width) => (
          <div key={width} className="flex min-w-0 items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0">
              <Skeleton className={`h-5 max-w-full ${width}`} />
              <Skeleton className="mt-1 h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
