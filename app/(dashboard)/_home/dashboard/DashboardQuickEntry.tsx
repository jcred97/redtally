import { useId, type ReactNode } from "react";
import Select from "@/app/components/forms/Select";
import { fieldClass, fieldLabelClass } from "@/app/components/forms/field-styles";

type DashboardQuickEntryProps = {
  groups: { publicId: string; name: string }[];
  entryId: string;
  pending: boolean;
  onGroupChange: (publicId: string) => void;
  children: ReactNode;
};

export default function DashboardQuickEntry({ groups, entryId, pending, onGroupChange, children }: DashboardQuickEntryProps) {
  const groupSelectId = useId();
  const currentGroup = groups.find(({ publicId }) => publicId === entryId);

  return (
    <section aria-labelledby="dashboard-entry-heading" className="min-w-0 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h2 id="dashboard-entry-heading" className="text-base font-semibold">Quick expense entry</h2>
      {groups.length > 1 ? (
        <div className={`mt-3 ${fieldLabelClass}`}>
          <label htmlFor={groupSelectId}>Expense group</label>
          <Select
            id={groupSelectId}
            value={entryId}
            onChange={onGroupChange}
            options={groups.map(({ publicId, name }) => ({ value: publicId, label: name }))}
            className={fieldClass}
          />
        </div>
      ) : (
        <p className="mt-2 wrap-anywhere text-sm text-gray-400">{currentGroup?.name}</p>
      )}
      <div className="mt-3" aria-busy={pending || undefined}>
        {pending ? <p role="status" className="text-sm text-gray-400">Loading expense group…</p> : children}
      </div>
    </section>
  );
}
