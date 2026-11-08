import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  InsightChartTooltip,
  categorySharePercentage,
  formatChartMoney,
  type CategoryChartRow,
} from "../client/src/components/InsightChartTooltip";
import {
  CHART_ANIMATION_DURATION,
  CHART_TOOLTIP_ANIMATION_DURATION,
  CHART_ANIMATION_EASING,
  CHART_REDUCED_MOTION_QUERY,
  getChartAnimationKey,
  useChartMotion,
} from "../client/src/hooks/useChartMotion";

const categories: CategoryChartRow[] = [
  { category: "food", name: "Food", total: 1250.5, recordCount: 3 },
  { category: "transport", name: "Transport", total: 1250.5, recordCount: 2 },
];
const categoryPayload = [
  { dataKey: "total", value: 1250.5, payload: categories[0] },
];
const annualPayload = [
  { dataKey: "trips", value: 12 },
  { dataKey: "tripFlights", value: 1234 },
  { dataKey: "passportFlights", value: 0 },
];

function categoryTooltip(lang: "en" | "zh", rows = categories, total = 2501) {
  return renderToStaticMarkup(
    createElement(InsightChartTooltip, {
      kind: "category",
      active: true,
      lang,
      currency: "HKD",
      total,
      categories: rows,
      payload: [{ dataKey: "total", payload: rows[0] }],
    })
  );
}

describe("annual insight tooltip SSR", () => {
  it("labels the year and every series count, including a real zero", () => {
    const html = renderToStaticMarkup(
      createElement(InsightChartTooltip, {
        kind: "annual",
        active: true,
        lang: "en",
        label: 2026,
        payload: annualPayload,
      })
    );
    expect(html).toContain("Year 2026");
    expect(html).toContain("Trips");
    expect(html).toContain("Trip flight records");
    expect(html).toContain("Personal passport");
    expect(html).toContain("12 records");
    expect(html).toContain("1,234 records");
    expect(html).toContain("0 records");
    expect(html).toContain(
      "Flight records may overlap; do not add the series together."
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("bg-card");
    expect(html).toContain("text-card-foreground");
  });

  it("formats Traditional Chinese year, labels, counts, and overlap warning", () => {
    const html = renderToStaticMarkup(
      createElement(InsightChartTooltip, {
        kind: "annual",
        active: true,
        lang: "zh",
        label: "2026",
        payload: annualPayload,
      })
    );
    for (const text of [
      "年份 2026",
      "旅程",
      "旅程航班記錄",
      "個人飛行護照",
      "1,234 項",
      "兩種航班記錄可能重疊，請勿相加。",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("does not fabricate values for missing or nonfinite series", () => {
    const html = renderToStaticMarkup(
      createElement(InsightChartTooltip, {
        kind: "annual",
        active: true,
        lang: "en",
        label: 2026,
        payload: [
          { dataKey: "trips", value: 2 },
          { dataKey: "tripFlights", value: NaN },
        ],
      })
    );
    expect(html).toContain("2 records");
    expect(html).not.toContain("Trip flight records</dt>");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Personal passport");
  });

  it.each([undefined, []])(
    "returns null for missing/empty payload %s",
    payload => {
      expect(
        renderToStaticMarkup(
          createElement(InsightChartTooltip, {
            kind: "annual",
            active: true,
            lang: "en",
            label: 2026,
            payload,
          })
        )
      ).toBe("");
    }
  );

  it("returns null when inactive or without a usable year/count", () => {
    for (const extra of [
      { active: false, label: 2026, payload: annualPayload },
      { active: true, payload: annualPayload },
      {
        active: true,
        label: 2026,
        payload: [{ dataKey: "trips", value: Infinity }],
      },
    ]) {
      expect(
        renderToStaticMarkup(
          createElement(InsightChartTooltip, {
            kind: "annual",
            lang: "en",
            ...extra,
          })
        )
      ).toBe("");
    }
  });
});

describe("category insight tooltip SSR", () => {
  it("shows the original currency, precise net amount, expense count, and same-currency share", () => {
    const html = categoryTooltip("en");
    for (const text of [
      "Food",
      "HKD 1,250.50",
      "Recorded amount",
      "Expense count",
      ">3</dd>",
      "Share of HKD net total",
      "50%",
      "shared ledger, not your personal share.",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("uses Traditional Chinese labels without changing the currency or amount", () => {
    const html = categoryTooltip("zh", [
      { ...categories[0], name: "餐飲" },
      categories[1],
    ]);
    for (const text of [
      "餐飲",
      "HKD 1,250.50",
      "支出記錄數",
      "佔 HKD 淨額",
      "50%",
      "原始幣別",
    ]) {
      expect(html).toContain(text);
    }
  });

  it.each(["en", "zh"] as const)(
    "withholds all category percentages if a refund category is negative (%s)",
    lang => {
      const rows = [
        { ...categories[0], total: 100 },
        { ...categories[1], total: -20 },
      ];
      const html = categoryTooltip(lang, rows, 80);
      expect(html).toContain("HKD 100.00");
      expect(html).not.toContain("%");
      expect(html).toContain(
        lang === "en" ? "Shares are hidden" : "不顯示佔比"
      );
      const refund = categoryTooltip(lang, [rows[1], rows[0]], 80);
      expect(refund).toContain("HKD -20.00");
      expect(refund).not.toContain("%");
    }
  );

  it("hides percentages for a zero or negative currency total, without hiding actual amounts", () => {
    for (const amount of [0, -20]) {
      const html = categoryTooltip(
        "en",
        [{ ...categories[0], total: amount }],
        amount
      );
      expect(html).toContain(`HKD ${formatChartMoney(amount, "en")}`);
      expect(html).not.toContain("%");
      expect(html).toContain("Expense count");
    }
  });

  it("requires current payload membership rather than showing stale category data", () => {
    for (const payload of [
      undefined,
      [],
      [{ dataKey: "total", payload: {} }],
      categoryPayload,
    ]) {
      const html = renderToStaticMarkup(
        createElement(InsightChartTooltip, {
          kind: "category",
          active: true,
          lang: "en",
          currency: "USD",
          total: 10,
          categories: [
            { category: "other", name: "Other", total: 10, recordCount: 1 },
          ],
          payload,
        })
      );
      expect(html).toBe("");
    }
  });
});

describe("honest chart shares and motion policy", () => {
  it("accepts only a matching positive, entirely nonnegative denominator", () => {
    expect(categorySharePercentage(1250.5, 2501, categories)).toBe(50);
    expect(categorySharePercentage(0, 2501, categories)).toBe(0);
    for (const total of [0, -1, NaN, Infinity, 3000]) {
      expect(categorySharePercentage(1250.5, total, categories)).toBeNull();
    }
    expect(categorySharePercentage(-10, 2501, categories)).toBeNull();
    expect(categorySharePercentage(3000, 2501, categories)).toBeNull();
    expect(categorySharePercentage(1, 1, [])).toBeNull();
    expect(categorySharePercentage(1, 1, [{ total: NaN }])).toBeNull();
    expect(
      categorySharePercentage(100, 80, [{ total: 100 }, { total: -20 }])
    ).toBeNull();
  });

  it("formats money consistently and never converts the original amount", () => {
    expect(formatChartMoney(1234.5, "en")).toBe("1,234.50");
    expect(formatChartMoney(1234.5, "zh")).toBe("1,234.50");
    expect(formatChartMoney(-12.25, "en")).toBe("-12.25");
  });

  it("uses explicit sub-300ms motion durations and an ease-out entrance", () => {
    expect(CHART_ANIMATION_DURATION).toBe(280);
    expect(CHART_ANIMATION_DURATION).toBeLessThan(300);
    expect(CHART_TOOLTIP_ANIMATION_DURATION).toBe(140);
    expect(CHART_ANIMATION_EASING).toBe("ease-out");
    expect(CHART_REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });

  it("keys animations by scope and actual data, not refetch identities", () => {
    const key = getChartAnimationKey("categories:all:HKD", categories);
    expect(
      getChartAnimationKey(
        "categories:all:HKD",
        categories.map(row => ({ ...row }))
      )
    ).toBe(key);
    expect(getChartAnimationKey("categories:2026:HKD", categories)).not.toBe(
      key
    );
    expect(getChartAnimationKey("categories:all:USD", categories)).not.toBe(
      key
    );
    expect(
      getChartAnimationKey("categories:all:HKD", [
        { ...categories[0], total: 2 },
      ])
    ).not.toBe(key);
  });

  it("renders reduced-motion safely on the server without accessing window", () => {
    function MotionProbe() {
      return createElement(
        "span",
        null,
        useChartMotion() ? "motion disabled" : "motion enabled"
      );
    }
    expect(renderToStaticMarkup(createElement(MotionProbe))).toBe(
      "<span>motion disabled</span>"
    );
  });
});
