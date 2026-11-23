import { formatPesoAmount } from "@/app/lib/expenses/money";

type SpendingSeries = {
  month: string;
  throughDay: string;
  totalCentavos: number | bigint;
  dailyCentavos: (number | bigint)[];
};

const shortMonth = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const compactPesos = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 2 });
const plotWidth = 600;
const plotHeight = 200;

function monthName(month: string) {
  return shortMonth.format(new Date(`${month}-01T00:00:00Z`));
}

function dateRange(month: string, throughDay: string) {
  const day = Number(throughDay.slice(-2));
  return `${monthName(month)} 1${day > 1 ? `–${day}` : ""}`;
}

function stepPath(dailyCentavos: SpendingSeries["dailyCentavos"], dayCount: number, axisMax: number) {
  // Each step adds that day's expenses at the end of its position on the axis.
  const steps = dailyCentavos.map((amount, index) => {
    const x = (index + 1) * plotWidth / dayCount;
    const y = plotHeight * (1 - Number(amount) / axisMax);
    return `H${x} V${y}`;
  });
  return `M0 ${plotHeight} ${steps.join(" ")}`;
}

export default function SpendingTrend({ dashboard }: { dashboard: SpendingSeries & { comparison: SpendingSeries | null } }) {
  const { month, throughDay, totalCentavos, dailyCentavos, comparison } = dashboard;
  const dayCount = Math.max(dailyCentavos.length, comparison?.dailyCentavos.length ?? 0);
  // The plot uses numeric coordinates; displayed amounts retain their exact centavos.
  const largestTotal = Math.max(Number(totalCentavos), Number(comparison?.totalCentavos ?? 0));
  const hasSpending = largestTotal > 0;
  const stepSize = 10 ** Math.max(0, Math.floor(Math.log10(largestTotal / 2)));
  const midpoint = Math.ceil(largestTotal / (2 * stepSize)) * stepSize;
  const axisMax = midpoint * 2;
  const middleDay = Math.ceil(dayCount / 2);
  const selectedPath = hasSpending ? stepPath(dailyCentavos, dayCount, axisMax) : "";
  const comparisonPath = hasSpending && comparison ? stepPath(comparison.dailyCentavos, dayCount, axisMax) : "";

  return (
    <section
      aria-labelledby="dashboard-trend-heading"
      className="min-w-0 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6 lg:col-start-1 lg:row-start-1"
    >
      <h2 id="dashboard-trend-heading" className="text-lg font-semibold">Spending trend</h2>
      <p className="mt-1 text-sm text-gray-300">Cumulative spending by day</p>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <dt className="flex items-center gap-2 text-sm text-gray-300">
            <span aria-hidden="true" className="w-4 border-t-2 border-red-400" />
            {dateRange(month, throughDay)}
          </dt>
          <dd className="mt-1 font-semibold tabular-nums">{formatPesoAmount(totalCentavos)}</dd>
        </div>
        {comparison && (
          <div>
            <dt className="flex items-center gap-2 text-sm text-gray-300">
              <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-gray-300" />
              {dateRange(comparison.month, comparison.throughDay)}
            </dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatPesoAmount(comparison.totalCentavos)}</dd>
          </div>
        )}
      </dl>
      {hasSpending ? (
        <>
          <div aria-hidden="true" className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 sm:gap-x-3">
            <div className="flex flex-col justify-between text-right text-xs tabular-nums text-gray-300">
              {[axisMax, midpoint, 0].map((value) => (
                <span key={value} className="first:-translate-y-1/2 last:translate-y-1/2">
                  ₱{compactPesos.format(value / 100)}
                </span>
              ))}
            </div>
            <svg
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              preserveAspectRatio="none"
              className="block h-36 w-full overflow-visible sm:h-52 lg:h-60"
            >
              <defs>
                <linearGradient id="dashboard-spending-shade" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                  <stop stopColor="var(--color-red-400)" stopOpacity="0.24" />
                  <stop offset="1" stopColor="var(--color-red-400)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, plotHeight / 2, plotHeight].map((y) => (
                <line key={y} x1="0" x2={plotWidth} y1={y} y2={y} stroke="var(--color-gray-800)" vectorEffect="non-scaling-stroke" />
              ))}
              {totalCentavos > 0 && (
                <path d={`${selectedPath} V${plotHeight} H0 Z`} fill="url(#dashboard-spending-shade)" />
              )}
              <path
                d={selectedPath}
                stroke="var(--color-red-400)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
                fill="none"
              />
              {comparisonPath && (
                <path
                  d={comparisonPath}
                  stroke="var(--color-gray-300)"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                />
              )}
            </svg>
            <div className="relative col-start-2 flex justify-between text-xs tabular-nums text-gray-300">
              <span>Start</span>
              {dayCount >= 4 && (
                <span className="absolute -translate-x-1/2" style={{ left: `${middleDay / dayCount * 100}%` }}>
                  Day {middleDay}
                </span>
              )}
              <span>Day {dayCount}</span>
            </div>
          </div>
          <details className="mt-4 border-t border-gray-800 pt-3">
            <summary className="w-fit cursor-pointer rounded-sm py-1.5 text-sm font-medium text-gray-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400">
              Daily cumulative totals
            </summary>
            <table className="mt-2 w-full table-fixed text-sm tabular-nums">
              <caption className="sr-only">Cumulative spending by day</caption>
              <thead className="text-gray-300">
                <tr>
                  <th scope="col" className="w-10 py-1 text-left font-medium">Day</th>
                  <th scope="col" className="py-1 text-right font-medium">{monthName(month)}</th>
                  {comparison && <th scope="col" className="py-1 text-right font-medium">{monthName(comparison.month)}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {Array.from({ length: dayCount }, (_, index) => {
                  const selectedAmount = dailyCentavos[index];
                  const comparisonAmount = comparison?.dailyCentavos[index];
                  return (
                    <tr key={index}>
                      <th scope="row" className="py-1.5 text-left font-medium">{index + 1}</th>
                      <td className="px-1 py-1.5 text-right [overflow-wrap:anywhere]">
                        {selectedAmount === undefined ? "—" : formatPesoAmount(selectedAmount)}
                      </td>
                      {comparison && (
                        <td className="py-1.5 text-right [overflow-wrap:anywhere]">
                          {comparisonAmount === undefined ? "—" : formatPesoAmount(comparisonAmount)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="mt-5 rounded-lg bg-background/45 px-3 py-4 text-sm text-gray-300">No spending to chart for these dates.</p>
      )}
    </section>
  );
}
