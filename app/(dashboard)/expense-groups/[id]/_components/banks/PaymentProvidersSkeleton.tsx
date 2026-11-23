import { useSearchParams } from "next/navigation";
import Skeleton from "@/app/components/feedback/Skeleton";
import { settingsTileGridClass } from "@/app/components/tiles/SettingsTileLabel";

const tileNameWidths = ["w-28", "w-24", "w-32", "w-24", "w-28", "w-32"];

export default function PaymentProvidersSkeleton() {
  const providers = useSearchParams().getAll("provider");
  const payLater = providers.length === 1 && providers[0] === "pay-later";

  return (
    <div className="space-y-6">
      <div className="inline-flex gap-0.5 rounded-lg border border-gray-800 p-0.5">
        {["Banks", "Pay Later"].map((label) => (
          <span
            key={label}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${label === (payLater ? "Pay Later" : "Banks") ? "bg-gray-800 text-white" : "text-gray-400"}`}
          >
            {label}
          </span>
        ))}
      </div>
      <section>
        {payLater ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pay Later</h2>
            <div className="relative flex min-h-10 items-center px-4 py-2 text-sm font-medium">
              <span className="invisible">Add Pay Later provider</span>
              <Skeleton className="absolute inset-0 rounded-lg" />
            </div>
          </div>
        ) : <h2 className="mb-4 text-lg font-semibold">Banks</h2>}
        <ul className={settingsTileGridClass}>
          {tileNameWidths.map((width, index) => (
            <li key={index} className="min-w-0">
              <div className="flex h-full w-full items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
                <Skeleton className="size-11 shrink-0 rounded-full" />
                <div className="min-w-0">
                  <Skeleton className={`h-5 max-w-full ${width}`} />
                  <Skeleton className="mt-1 h-5 w-20" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
