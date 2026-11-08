import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  lang: "zh",
  auth: { data: { id: 1 }, isLoading: false, error: null } as any,
  summary: {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    dataUpdatedAt: 0,
  } as any,
  trips: { data: [], isLoading: false, error: null } as any,
  queryCalls: [] as Array<{ name: string; options: any }>,
  mutate: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({
    lang: state.lang,
    t: () => (state.lang === "zh" ? "資料連接中心" : "Connection hub"),
  }),
}));
vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => createElement("main", null, children),
}));
vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: any) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, variant, size, ...props }: any) =>
    asChild ? children : createElement("button", props, children),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => createElement("div", null, children),
  SelectTrigger: ({ children, ...props }: any) =>
    createElement("button", props, children),
  SelectValue: ({ placeholder }: any) =>
    createElement("span", null, placeholder),
  SelectContent: ({ children }: any) => createElement("div", null, children),
  SelectItem: ({ children }: any) => createElement("span", null, children),
}));
vi.mock("@/lib/trpc", () => {
  const query = (name: string, result: () => any) => ({
    useQuery: (_input: any, options: any) => {
      state.queryCalls.push({ name, options });
      return { ...result(), refetch: vi.fn() };
    },
  });
  const mutation = () => ({
    useMutation: () => ({ isPending: false, mutate: state.mutate }),
  });
  return {
    trpc: {
      useUtils: () => ({
        invalidate: state.invalidate,
        expenses: { autoClassify: { fetch: vi.fn() } },
      }),
      auth: { me: query("auth", () => state.auth) },
      trips: { list: query("trips", () => state.trips) },
      flights: { list: query("flights", () => ({ data: undefined })) },
      hotels: { list: query("hotels", () => ({ data: undefined })) },
      itinerary: { getDays: query("days", () => ({ data: undefined })) },
      expenses: { applyClassification: mutation() },
      connected: {
        importFlightsToPassport: mutation(),
        syncLogisticsToItinerary: mutation(),
      },
      sync: {
        getSummary: query("summary", () => state.summary),
        syncCountriesFromFlights: mutation(),
        syncCountriesFromTrips: mutation(),
        syncDataIntegrity: mutation(),
        syncAll: mutation(),
      },
    },
  };
});

import SyncPage from "../client/src/pages/SyncPage";
const render = () => renderToStaticMarkup(createElement(SyncPage));

beforeEach(() => {
  state.lang = "zh";
  state.auth = { data: { id: 1 }, isLoading: false, error: null };
  state.summary = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    dataUpdatedAt: 0,
  };
  state.trips = { data: [], isLoading: false, error: null };
  state.queryCalls = [];
  state.mutate.mockClear();
  state.invalidate.mockClear();
});

describe("SyncPage connected hub", () => {
  it("never imports, classifies or checks records during render", () => {
    const html = render();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(state.invalidate).not.toHaveBeenCalled();
    expect(html).toContain("不會在背景自動匯入");
    expect(html).toContain("不清理、不刪除");
    expect(
      state.queryCalls
        .filter(call => ["flights", "hotels", "days"].includes(call.name))
        .every(call => call.options.enabled === false)
    ).toBe(true);
  });

  it("shows a skeleton rather than fake zero counts while loading", () => {
    state.summary.isLoading = true;
    const html = render();
    expect((html.match(/aria-label="載入中"/g) ?? []).length).toBe(8);
    expect(html).not.toMatch(/tracking-tight">0<\/p>/);
  });

  it("shows unavailable counts as em dashes and surfaces query failures", () => {
    state.summary.error = { message: "Summary unavailable" };
    const html = render();
    expect(html).toContain("Summary unavailable");
    expect((html.match(/tracking-tight">—<\/p>/g) ?? []).length).toBe(8);
    expect(html).not.toMatch(/tracking-tight">0<\/p>/);
  });

  it("renders real stored counts including genuine zeros", () => {
    state.summary.data = {
      trips: 12,
      activities: 23,
      expenses: 34,
      mapPins: 0,
      tripFlights: 45,
      hotels: 56,
      pastFlights: 67,
      visitedCountries: 78,
      uncategorisedExpenses: 2,
    };
    const html = render();
    for (const count of [12, 23, 34, 0, 45, 56, 67, 78]) {
      expect(html).toContain(`tracking-tight">${count}</p>`);
    }
    expect(html).toContain("國家記錄可包含計劃到訪");
    expect(html).toContain("2 筆其他／未分類");
  });

  it("uses Hong Kong UTC+8 for the snapshot timestamp", () => {
    state.summary.dataUpdatedAt = Date.parse("2026-11-01T16:30:00Z");
    expect(render()).toContain("00:30 · 香港時間 UTC+8");
  });

  it("gates protected queries for signed-out users", () => {
    state.auth.data = null;
    const html = render();
    expect(html).toContain("登入後連接你的旅行資料");
    expect(html).not.toContain("匯入飛行護照");
    for (const name of ["summary", "trips", "flights", "hotels", "days"]) {
      expect(
        state.queryCalls.find(call => call.name === name)?.options.enabled
      ).toBe(false);
    }
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("retains bilingual manual-entry and preview-first guidance", () => {
    state.lang = "en";
    const html = render();
    expect(html).toContain("Import to flight passport");
    expect(html).toContain("View passport / add manually");
    expect(html).toContain("Preview and select items in Expenses");
    expect(html).toContain("An estimate is not proof of payment");
    expect(html).toContain("Review candidate locations in Map");
    expect(html).toContain("Check relationships (no deletion)");
    expect(html).toContain("Sync countries &amp; verify records");
    expect(html).not.toContain("Sync All");
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
