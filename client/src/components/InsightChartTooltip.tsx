import React, { type ReactNode } from "react";

type ChartLanguage = "en" | "zh";
type TooltipEntry = {
  dataKey?: unknown;
  value?: unknown;
  color?: string;
  payload?: unknown;
};
export type CategoryChartRow = {
  category: string;
  name: string;
  total: number;
  recordCount: number;
};
type TooltipProps = {
  active?: boolean;
  label?: unknown;
  payload?: readonly TooltipEntry[];
  lang: ChartLanguage;
} & (
  | { kind: "annual" }
  | {
      kind: "category";
      currency: string;
      total: number;
      categories: readonly CategoryChartRow[];
    }
);

export function formatChartMoney(amount: number, lang: ChartLanguage): string {
  return amount.toLocaleString(lang === "zh" ? "zh-HK" : "en-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A share is meaningful only for a positive, same-currency, nonnegative whole. */
export function categorySharePercentage(
  amount: number,
  total: number,
  categories: readonly Pick<CategoryChartRow, "total">[]
): number | null {
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    amount < 0 ||
    amount > total ||
    categories.length === 0 ||
    categories.some(row => !Number.isFinite(row.total) || row.total < 0)
  ) {
    return null;
  }
  // Reject mismatched denominators rather than showing a plausible but false share.
  const sum = categories.reduce((value, row) => value + row.total, 0);
  if (Math.abs(sum - total) > Math.max(0.005, Math.abs(total) * 1e-10)) {
    return null;
  }
  return (amount / total) * 100;
}

export function formatChartPercentage(
  value: number,
  lang: ChartLanguage
): string {
  return `${value.toLocaleString(lang === "zh" ? "zh-HK" : "en-HK", {
    maximumFractionDigits: 1,
  })}%`;
}

function TooltipFrame({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note: string;
}) {
  return (
    <div
      role="tooltip"
      className="max-w-[min(17rem,calc(100vw-3rem))] rounded-xl border border-primary/20 bg-card p-3 text-xs text-card-foreground shadow-lg"
    >
      <p className="mb-2 break-words border-b border-border pb-2 font-semibold text-primary">
        {title}
      </p>
      <dl className="space-y-2">{children}</dl>
      <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

const annualSeries = [
  { key: "trips", en: "Trips", zh: "旅程", color: "#0d766e" },
  {
    key: "tripFlights",
    en: "Trip flight records",
    zh: "旅程航班記錄",
    color: "#163c4f",
  },
  {
    key: "passportFlights",
    en: "Personal passport",
    zh: "個人飛行護照",
    color: "#bd8736",
  },
] as const;

export function InsightChartTooltip(props: TooltipProps) {
  if (!props.active || !props.payload?.length) return null;
  const zh = props.lang === "zh";
  const locale = zh ? "zh-HK" : "en-HK";

  if (props.kind === "annual") {
    const values = annualSeries.flatMap(series => {
      const entry = props.payload?.find(item => item.dataKey === series.key);
      return typeof entry?.value === "number" &&
        Number.isFinite(entry.value) &&
        entry.value >= 0
        ? [{ ...series, value: entry.value }]
        : [];
    });
    if (
      !values.length ||
      (typeof props.label !== "number" && typeof props.label !== "string")
    ) {
      return null;
    }
    return (
      <TooltipFrame
        title={`${zh ? "年份" : "Year"} ${props.label}`}
        note={
          zh
            ? "兩種航班記錄可能重疊，請勿相加。"
            : "Flight records may overlap; do not add the series together."
        }
      >
        {values.map(series => (
          <div
            key={series.key}
            className="flex items-start justify-between gap-3"
          >
            <dt className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              {zh ? series.zh : series.en}
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums">
              {series.value.toLocaleString(locale)} {zh ? "項" : "records"}
            </dd>
          </div>
        ))}
      </TooltipFrame>
    );
  }

  // Resolve against current chart rows, not a stale/untrusted payload object.
  const entry = props.payload.find(item => item.dataKey === "total");
  const payload = entry?.payload;
  if (!payload || typeof payload !== "object" || !("category" in payload))
    return null;
  const row = props.categories.find(item => item.category === payload.category);
  if (!row || !Number.isFinite(row.total) || !Number.isFinite(row.recordCount))
    return null;
  const percentage = categorySharePercentage(
    row.total,
    props.total,
    props.categories
  );
  return (
    <TooltipFrame
      title={row.name}
      note={
        percentage === null
          ? zh
            ? "含負數分類、總額非正數或資料不完整時，不顯示佔比；退款以負數計。"
            : "Shares are hidden for negative categories, non-positive totals, or incomplete data. Refunds reduce totals."
          : zh
            ? "原始幣別的分類淨額；包含共用帳目，不是個人應付額。"
            : "Net category amount in the original currency; shared ledger, not your personal share."
      }
    >
      <div className="flex items-start justify-between gap-3">
        <dt>{zh ? "已記錄支出" : "Recorded amount"}</dt>
        <dd className="break-words text-right font-semibold tabular-nums">
          {props.currency} {formatChartMoney(row.total, props.lang)}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-3">
        <dt>{zh ? "支出記錄數" : "Expense count"}</dt>
        <dd className="font-semibold tabular-nums">
          {row.recordCount.toLocaleString(locale)}
        </dd>
      </div>
      {percentage !== null && (
        <div className="flex items-start justify-between gap-3">
          <dt>
            {zh
              ? `佔 ${props.currency} 淨額`
              : `Share of ${props.currency} net total`}
          </dt>
          <dd className="font-semibold tabular-nums">
            {formatChartPercentage(percentage, props.lang)}
          </dd>
        </div>
      )}
    </TooltipFrame>
  );
}
