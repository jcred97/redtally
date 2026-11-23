import type { ReactNode } from "react";

export const settingsTileClass =
  "flex h-full w-full cursor-pointer items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-left text-sm transition-colors hover:border-gray-600 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400";

export default function SettingsTileLabel({ icon, name, status, enabled }: {
  icon: ReactNode;
  name: string;
  status?: string;
  enabled?: boolean;
}) {
  return (
    <>
      {icon}
      <span className="min-w-0">
        <span className="block wrap-anywhere font-medium">{name}</span>
        {status && <span className={`mt-1 block ${enabled ? "text-emerald-400" : "text-gray-400"}`}>{status}</span>}
      </span>
    </>
  );
}
