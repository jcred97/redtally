import Form from "next/form";
import DateInput from "@/app/components/forms/DateInput";

type DashboardFiltersProps = {
  month: string;
  groups: { publicId: string; name: string }[];
  selectedIds: string[];
  entryId?: string;
};

export default function DashboardFilters({ month, groups, selectedIds, entryId }: DashboardFiltersProps) {
  const included = new Set(selectedIds);

  return (
    <Form
      key={`${month}:${selectedIds.join(",")}`}
      action="/"
      scroll={false}
      prefetch={false}
      aria-label="Dashboard filters"
      className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5"
    >
      <input type="hidden" name="scope" value="1" />
      {entryId && <input type="hidden" name="entry" value={entryId} />}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 text-sm font-medium text-gray-200">
          Month
          <DateInput
            type="month"
            name="month"
            min="0001-01"
            max="9999-12"
            defaultValue={month}
            className="mt-1 block min-h-11 max-w-full rounded-lg border border-gray-700 bg-background px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-red-400"
          />
        </label>
        <span className="pb-3 text-xs text-gray-400">Manila time</span>
      </div>
      <details className="mt-3 min-w-0">
        <summary className="min-h-10 cursor-pointer rounded-sm py-2 text-sm font-medium text-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
          <span>Expense groups</span>
          <span className="ml-2 text-xs font-normal text-gray-400">{selectedIds.length} included</span>
        </summary>
        <fieldset className="mt-1 grid max-h-40 gap-x-4 overflow-y-auto sm:grid-cols-2">
          <legend className="sr-only">Expense groups included in the report</legend>
          {groups.map(({ publicId, name }) => (
            <label key={publicId} className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-sm text-sm text-gray-300 hover:text-white">
              <input
                type="checkbox"
                name="group"
                value={publicId}
                defaultChecked={included.has(publicId)}
                className="size-4 shrink-0 accent-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
              />
              <span className="min-w-0 wrap-anywhere">{name}</span>
            </label>
          ))}
        </fieldset>
      </details>
      <button
        type="submit"
        className="mt-4 min-h-11 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-white hover:border-gray-500 hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Apply filters
      </button>
    </Form>
  );
}
