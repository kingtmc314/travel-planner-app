import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AirportFlightObservation,
  FlightStatusResult,
} from "../shared/flightStatus";

const driver = vi.hoisted(() => ({ current: null as any }));
const ui = vi.hoisted(() => ({
  auth: { data: null as any, isError: false },
  status: {
    data: undefined as any,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  watch: {
    data: { enabled: false, scheduleActive: false },
    isError: false,
    isFetching: false,
  },
  watches: {
    data: { references: [] as any[], scheduleActive: false },
    dataUpdatedAt: 0,
    isError: false,
    isFetching: false,
  },
  queryClient: {} as any,
  statusQuery: vi.fn(),
  watchQuery: vi.fn(),
  watchesQuery: vi.fn(),
  setWatch: vi.fn(),
  checkWatched: vi.fn(),
  watchOptions: null as any,
  pending: false,
  watchStateInvalidate: vi.fn(),
  watchesInvalidate: vi.fn(),
  notificationsInvalidate: vi.fn(),
  unreadInvalidate: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (value: any) =>
      driver.current ? driver.current.state(value) : actual.useState(value),
    useRef: (value: any) =>
      driver.current ? driver.current.ref(value) : actual.useRef(value),
    useMemo: (factory: any, deps: any) =>
      driver.current
        ? driver.current.memo(factory, deps)
        : actual.useMemo(factory, deps),
    useId: () =>
      driver.current
        ? driver.current.memo(() => "status-test-id", [])
        : actual.useId(),
    useEffect: (effect: any, deps: any) =>
      driver.current
        ? driver.current.effect(effect, deps)
        : actual.useEffect(effect, deps),
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ui.queryClient,
}));
const utils = {
  flightStatus: {
    watchState: { invalidate: ui.watchStateInvalidate },
    watches: { invalidate: ui.watchesInvalidate },
  },
  notifications: {
    list: { invalidate: ui.notificationsInvalidate },
    unreadCount: { invalidate: ui.unreadInvalidate },
  },
};
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ui.auth } },
    useUtils: () => utils,
    flightStatus: {
      status: {
        useQuery: (...args: any[]) => {
          ui.statusQuery(...args);
          return ui.status;
        },
      },
      watchState: {
        useQuery: (...args: any[]) => {
          ui.watchQuery(...args);
          return ui.watch;
        },
      },
      watches: {
        useQuery: (...args: any[]) => {
          ui.watchesQuery(...args);
          return ui.watches;
        },
      },
      setWatch: {
        useMutation: (options: any) => {
          ui.watchOptions = options;
          return { mutate: ui.setWatch, isPending: ui.pending, isError: false };
        },
      },
      checkWatched: { useMutation: () => ({ mutateAsync: ui.checkWatched }) },
    },
  },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant, size, ...props }: any) =>
    createElement("button", props, children),
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) =>
    createElement("button", {
      ...props,
      role: "switch",
      "aria-checked": checked,
      onClick: () => onCheckedChange(!checked),
    }),
}));
import FlightStatusCard, {
  flightStatusEligibility,
  formatFlightSourceTimestamp,
  FlightStatusResultView,
  FlightWatchDisclosure,
  type FlightStatusCardProps,
} from "../client/src/components/FlightStatusCard";
import FlightWatchRefresh, {
  createFlightCheckGate,
  FLIGHT_REFRESH_INTERVAL,
} from "../client/src/components/FlightWatchRefresh";

const observation: AirportFlightObservation = {
  id: "hkia:published",
  provider: "hkia",
  date: "2026-11-08",
  flightNumber: "CX543",
  fromCode: "HKG",
  toCode: "HND",
  direction: "departure",
  scheduledTime: "23:10",
  status: "boarding",
  statusText: "Boarding",
  gate: "42",
  terminal: "1",
  checkInAisle: "B",
  baggageBelt: null,
  sourceUpdatedAt: Date.parse("2026-11-08T15:05:00Z"),
  fetchedAt: Date.parse("2026-11-08T15:06:00Z"),
};
const result = (
  outcome: FlightStatusResult["outcome"] = "available",
  value: AirportFlightObservation | null = observation
): FlightStatusResult => ({
  outcome,
  observation: value,
  checkedAt: Date.parse("2026-11-08T15:07:00Z"),
  message: "Airport supplied record.",
  sourceUrl: "https://data.gov.hk/en-data/dataset/aahk-team1-flight-info",
  experimentalRecentData: true,
});
const props: FlightStatusCardProps = {
  reference: { kind: "trip", id: 17 },
  flightNumber: "CX543",
  date: "2026-11-08",
  fromCode: "HKG",
  toCode: "HND",
  authorized: true,
  lang: "en",
};
const renderResult = (
  changes: Partial<React.ComponentProps<typeof FlightStatusResultView>> = {}
) =>
  renderToStaticMarkup(
    createElement(FlightStatusResultView, {
      lang: "en",
      onRefresh: vi.fn(),
      ...changes,
    })
  );
function visibleDocument(visibilityState = "visible") {
  const listeners = new Map<string, Function>();
  const document = {
    visibilityState,
    addEventListener: vi.fn((name, fn) => listeners.set(name, fn)),
    removeEventListener: vi.fn(name => listeners.delete(name)),
  };
  vi.stubGlobal("document", document);
  return { document, listeners };
}
const sameDeps = (a: any[], b: any[]) =>
  Boolean(
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  );
function hookHarness() {
  const slots: any[] = [];
  let index = 0;
  let queued: (() => void)[] = [];
  const hooks = {
    state(initial: any) {
      const at = index++;
      if (!(at in slots))
        slots[at] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[at].value,
        (next: any) => {
          slots[at].value =
            typeof next === "function" ? next(slots[at].value) : next;
        },
      ];
    },
    ref(initial: any) {
      const at = index++;
      return slots[at] ?? (slots[at] = { current: initial });
    },
    memo(factory: any, deps: any[]) {
      const at = index++;
      if (!slots[at] || !sameDeps(slots[at].deps, deps))
        slots[at] = { deps, value: factory() };
      return slots[at].value;
    },
    effect(effect: any, deps: any[]) {
      const at = index++;
      if (!slots[at] || !sameDeps(slots[at].deps, deps))
        queued.push(() => {
          slots[at]?.cleanup?.();
          slots[at] = { deps, effect, cleanup: effect() };
        });
    },
  };
  return {
    render(fn: () => any) {
      index = 0;
      queued = [];
      driver.current = hooks;
      let tree;
      try {
        tree = fn();
      } finally {
        driver.current = null;
      }
      for (const run of queued) run();
      return tree;
    },
    replayEffects() {
      for (const slot of slots)
        if (slot.effect) {
          slot.cleanup?.();
          slot.cleanup = slot.effect();
        }
    },
    unmount() {
      for (const slot of slots) slot.cleanup?.();
    },
  };
}
function elements(tree: any, predicate: (value: any) => boolean): any[] {
  if (Array.isArray(tree))
    return tree.flatMap(item => elements(item, predicate));
  if (!React.isValidElement(tree)) return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...elements((tree.props as any).children, predicate),
  ];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement(tree)) return text((tree.props as any).children);
  return typeof tree === "string" || typeof tree === "number"
    ? String(tree)
    : "";
}
function expand(cardProps = props) {
  const card = hookHarness();
  const first = card.render(() => FlightStatusCard(cardProps));
  elements(first, el => el.props["aria-expanded"] === false)[0].props.onClick();
  const tree = card.render(() => FlightStatusCard(cardProps));
  return { tree, card };
}
function expandedController(tree: any) {
  return elements(
    tree,
    el =>
      typeof el.type === "function" && el.type.name === "ExpandedFlightStatus"
  )[0];
}
function watchController(userId = 7) {
  ui.auth.data = { id: userId };
  const root = FlightWatchRefresh() as any;
  const hooks = hookHarness();
  return {
    root,
    hooks,
    render: () => hooks.render(() => root.type(root.props)),
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  ui.auth = { data: null, isError: false };
  ui.status = {
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  ui.watch = {
    data: { enabled: false, scheduleActive: false },
    isError: false,
    isFetching: false,
  };
  ui.watches = {
    data: { references: [], scheduleActive: false },
    dataUpdatedAt: 0,
    isError: false,
    isFetching: false,
  };
  ui.pending = false;
  ui.watchOptions = null;
  ui.queryClient = {};
  ui.checkWatched.mockResolvedValue({
    checked: 1,
    notificationsCreated: 0,
    scheduleActive: false,
  });
});
afterEach(() => {
  driver.current = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("source status view SSR, actual provenance and fallback semantics", () => {
  it("shows only published fields and Hong Kong source timestamps, never estimated arrival", () => {
    const html = renderResult({ result: result() });
    for (const label of [
      "Boarding",
      "Gate",
      "42",
      "Terminal",
      "Check-in aisle",
      "2026-11-08 23:10",
      "23:05",
      "23:06",
      "23:07",
      "Asia/Hong_Kong",
      "UTC+8",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("Baggage belt");
    expect(html).not.toContain("Estimated arrival");
    expect(html).not.toContain("On time");
    expect(html).toContain("Airport Authority Hong Kong");
    expect(html).toContain("DATA.GOV.HK");
    expect(html).toContain("only guarantees the previous day");
    expect(html).toContain("dates actually returned");
    expect(html).toContain("not worldwide");
    expect(html).toContain("never overwrites times, notes");
  });
  it.each(["not_found", "unsupported", "unavailable", "ambiguous"] as const)(
    "%s never leaks an inappropriate cached observation or infers completion",
    outcome => {
      const html = renderResult({ result: result(outcome) });
      expect(html).not.toContain("Boarding");
      expect(html).not.toContain("<dt");
      expect(html).not.toContain("Landed");
      if (outcome === "not_found")
        expect(html).toContain("does not mean landed or cancelled");
    }
  );
  it("labels stale observations as last-known, and hides cached observations on outage", () => {
    const html = renderResult({ result: result("stale") });
    expect(html).toContain("last-known information, not current status");
    expect(html).toContain("Boarding");
    const outage = renderResult({ result: result(), error: true });
    expect(outage).toContain("manual record is unchanged");
    expect(outage).not.toContain("Boarding");
  });
  it("does not invent a status or source timestamp when none is published", () => {
    const html = renderResult({
      result: result("available", {
        ...observation,
        statusText: "",
        status: "scheduled",
        sourceUpdatedAt: null,
        scheduledTime: null,
        gate: null,
        terminal: null,
        checkInAisle: null,
      }),
    });
    expect(html).toContain("Status text not published");
    expect(html).not.toContain("Source updated:");
    expect(html).not.toContain("Airport-published clock</dt>");
    expect(html).not.toContain("On time");
    expect(formatFlightSourceTimestamp(NaN, "en")).toBeNull();
    expect(formatFlightSourceTimestamp(null, "zh")).toBeNull();
  });
  it("escapes source text and refuses unsafe attribution URLs", () => {
    const data = {
      ...result("available", {
        ...observation,
        statusText: "<script>alert(1)</script>",
        gate: "<img onerror=bad>",
      }),
      sourceUrl: "javascript:alert(1)",
    };
    const html = renderResult({ result: data });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("https://data.gov.hk/");
  });
  it("provides Traditional Chinese limitations and honest inactive background wording", () => {
    expect(
      renderResult({ lang: "zh", result: result("not_found", null) })
    ).toContain("不代表已抵達或取消");
    expect(renderResult({ lang: "zh" })).toContain("官方文件只保證前一日資料");
    const en = renderToStaticMarkup(
      createElement(FlightWatchDisclosure, {
        lang: "en",
        scheduleActive: false,
      })
    );
    expect(en).toContain("5 min checks while the app is visible");
    expect(en).toContain("in-app notifications only");
    expect(en).toContain(
      "not activated until a published handler / scheduler is configured"
    );
    expect(en).toContain("closing the app may miss changes");
    for (const unsupported of ["push", "SMS", "email", "iPhone"])
      expect(en).not.toContain(unsupported);
    const zh = renderToStaticMarkup(
      createElement(FlightWatchDisclosure, {
        lang: "zh",
        scheduleActive: false,
      })
    );
    expect(zh).toContain("背景檢查尚未啟用");
    expect(zh).toContain("關閉 App 可能錯過變更");
    expect(
      renderToStaticMarkup(
        createElement(FlightWatchDisclosure, {
          lang: "en",
          scheduleActive: true,
        })
      )
    ).not.toContain("not activated");
  });
});

describe("collapsed status card privacy, source eligibility and opt-in interactions", () => {
  it("50 collapsed saved records mount no status/watch hooks or mutations", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        ...Array.from({ length: 50 }, (_, id) =>
          createElement(FlightStatusCard, {
            ...props,
            key: id,
            reference: { kind: "passport", id: id + 1 },
          })
        )
      )
    );
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(50);
    expect(ui.statusQuery).not.toHaveBeenCalled();
    expect(ui.watchQuery).not.toHaveBeenCalled();
    expect(ui.setWatch).not.toHaveBeenCalled();
  });
  it("expanded guests and unsupported/incomplete flights mount no RPC hooks", () => {
    for (const changes of [
      { authorized: false },
      { fromCode: "NRT", toCode: "HND" },
      { flightNumber: "" },
      { date: "2026-02-29" },
    ]) {
      const { tree } = expand({ ...props, ...changes });
      renderToStaticMarkup(tree);
    }
    expect(ui.statusQuery).not.toHaveBeenCalled();
    expect(ui.watchQuery).not.toHaveBeenCalled();
    expect(ui.setWatch).not.toHaveBeenCalled();
    expect(text(expand({ ...props, authorized: false }).tree)).toContain(
      "Guests do not query status or create watches"
    );
    expect(
      text(expand({ ...props, fromCode: "NRT", toCode: "HND" }).tree)
    ).toContain("only supports flights involving HKG");
  });
  it("validates actual dates, distinct routes and normalized HKG identities without date-range guesses", () => {
    expect(
      flightStatusEligibility({
        ...props,
        flightNumber: " cx 543 ",
        fromCode: " hkg ",
      })
    ).toBe("eligible");
    expect(flightStatusEligibility({ ...props, date: "2028-02-29" })).toBe(
      "eligible"
    );
    expect(flightStatusEligibility({ ...props, date: "2026-02-29" })).toBe(
      "incomplete"
    );
    expect(flightStatusEligibility({ ...props, date: "0000-01-01" })).toBe(
      "incomplete"
    );
    expect(flightStatusEligibility({ ...props, flightNumber: "00543" })).toBe(
      "incomplete"
    );
    expect(flightStatusEligibility({ ...props, flightNumber: "7C543" })).toBe(
      "eligible"
    );
    expect(flightStatusEligibility({ ...props, toCode: "HKG" })).toBe(
      "incomplete"
    );
  });
  it("calls status only after expansion with the saved reference, not arbitrary private fields", () => {
    visibleDocument();
    const { tree } = expand(props); // authorized includes read-only viewers, not canEdit
    renderToStaticMarkup(tree);
    expect(ui.statusQuery).toHaveBeenCalledOnce();
    expect(ui.statusQuery.mock.calls[0][0]).toEqual({
      reference: { kind: "trip", id: 17 },
    });
    expect(ui.statusQuery.mock.calls[0][1]).toMatchObject({
      enabled: true,
      retry: false,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchInterval: 300000,
    });
    expect(ui.setWatch).not.toHaveBeenCalled();
  });
  it("disables hidden polling and manual hidden refresh, then stops hooks on collapse/identity changes", () => {
    visibleDocument("hidden");
    const { tree, card } = expand();
    renderToStaticMarkup(tree);
    expect(ui.statusQuery.mock.calls[0][1]).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
    const child = expandedController(tree);
    const hooks = hookHarness();
    const detail = hooks.render(() => child.type(child.props));
    const view = elements(detail, el => el.type === FlightStatusResultView)[0];
    view.props.onRefresh();
    expect(ui.status.refetch).not.toHaveBeenCalled();
    elements(tree, el => el.props["aria-expanded"] === true)[0].props.onClick();
    const closed = card.render(() => FlightStatusCard(props));
    expect(expandedController(closed)).toBeUndefined();
    expect(
      expandedController(
        card.render(() =>
          FlightStatusCard({ ...props, reference: { kind: "trip", id: 18 } })
        )
      )
    ).toBeUndefined();
    hooks.unmount();
  });
  it("only explicit watch toggle writes; pending and concurrent clicks are locked", () => {
    visibleDocument();
    const child = expandedController(expand().tree);
    const hooks = hookHarness();
    let detail = hooks.render(() => child.type(child.props));
    const toggle = elements(
      detail,
      el => typeof el.props.onCheckedChange === "function"
    )[0];
    expect(toggle.props.checked).toBe(false);
    expect(toggle.props.disabled).toBe(false);
    expect(ui.setWatch).not.toHaveBeenCalled();
    toggle.props.onCheckedChange(true);
    toggle.props.onCheckedChange(true);
    expect(ui.setWatch).toHaveBeenCalledOnce();
    expect(ui.setWatch).toHaveBeenCalledWith({
      reference: { kind: "trip", id: 17 },
      enabled: true,
    });
    ui.watchOptions.onSuccess();
    ui.watchOptions.onSettled();
    expect(ui.watchStateInvalidate).toHaveBeenCalledWith({
      reference: { kind: "trip", id: 17 },
    });
    expect(ui.watchesInvalidate).toHaveBeenCalledOnce();
    ui.pending = true;
    detail = hooks.render(() => child.type(child.props));
    const pending = elements(
      detail,
      el => typeof el.props.onCheckedChange === "function"
    )[0];
    expect(pending.props.disabled).toBe(true);
    pending.props.onCheckedChange(false);
    expect(ui.setWatch).toHaveBeenCalledOnce();
    hooks.unmount();
  });
  it("does not enroll while watch preferences are loading or errored", () => {
    visibleDocument();
    ui.watch.isError = true;
    const child = expandedController(expand().tree),
      hooks = hookHarness();
    const detail = hooks.render(() => child.type(child.props));
    const toggle = elements(
      detail,
      el => typeof el.props.onCheckedChange === "function"
    )[0];
    expect(toggle.props.disabled).toBe(true);
    toggle.props.onCheckedChange(true);
    expect(ui.setWatch).not.toHaveBeenCalled();
    hooks.unmount();
  });
});

describe("root visible watch refresh", () => {
  it("guest SSR mounts no watch RPCs, checks, or enrollment", () => {
    expect(renderToStaticMarkup(createElement(FlightWatchRefresh))).toBe("");
    expect(ui.watchesQuery).not.toHaveBeenCalled();
    expect(ui.checkWatched).not.toHaveBeenCalled();
    expect(ui.setWatch).not.toHaveBeenCalled();
  });
  it("reads only the own watch list with bounded React Query options, no check for empty watches", () => {
    visibleDocument();
    const controller = watchController();
    controller.render();
    expect(ui.watchesQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        enabled: true,
        refetchInterval: 300000,
        retry: false,
        refetchOnWindowFocus: false,
        refetchIntervalInBackground: false,
      })
    );
    expect(ui.checkWatched).not.toHaveBeenCalled();
    controller.hooks.unmount();
  });
  it("does no check or polling while hidden, even with watches", () => {
    visibleDocument("hidden");
    ui.watches.data.references = [props.reference];
    ui.watches.dataUpdatedAt = 100;
    const controller = watchController();
    controller.render();
    expect(ui.watchesQuery.mock.calls[0][1]).toMatchObject({
      enabled: false,
      refetchInterval: false,
    });
    expect(ui.checkWatched).not.toHaveBeenCalled();
    controller.hooks.unmount();
  });
  it("deduplicates StrictMode effects and concurrent controllers and never invalidates watches on check", async () => {
    visibleDocument();
    ui.watches.data.references = [props.reference];
    ui.watches.dataUpdatedAt = 100;
    let resolve!: (result: any) => void;
    ui.checkWatched.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const first = watchController();
    first.render();
    first.hooks.replayEffects();
    const second = watchController();
    second.render();
    expect(ui.checkWatched).toHaveBeenCalledOnce();
    resolve({ checked: 1, notificationsCreated: 0, scheduleActive: false });
    await flush();
    first.hooks.replayEffects();
    expect(ui.checkWatched).toHaveBeenCalledOnce();
    expect(ui.watchesInvalidate).not.toHaveBeenCalled();
    expect(ui.notificationsInvalidate).not.toHaveBeenCalled();
    expect(ui.unreadInvalidate).not.toHaveBeenCalled();
    first.hooks.unmount();
    second.hooks.unmount();
  });
  it("checks each fresh dataUpdatedAt no faster than five minutes and invalidates notifications only after alerts", async () => {
    visibleDocument();
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    ui.watches.data.references = [props.reference];
    ui.watches.dataUpdatedAt = 100;
    const controller = watchController();
    controller.render();
    await flush();
    now += 1000;
    ui.watches.dataUpdatedAt = 101;
    controller.render();
    await flush();
    expect(ui.checkWatched).toHaveBeenCalledOnce();
    now += FLIGHT_REFRESH_INTERVAL;
    ui.watches.dataUpdatedAt = 102;
    ui.checkWatched.mockResolvedValue({
      checked: 1,
      notificationsCreated: 2,
      scheduleActive: false,
    });
    controller.render();
    await flush();
    expect(ui.checkWatched).toHaveBeenCalledTimes(2);
    expect(ui.notificationsInvalidate).toHaveBeenCalledOnce();
    expect(ui.unreadInvalidate).toHaveBeenCalledOnce();
    expect(ui.watchesInvalidate).not.toHaveBeenCalled();
    expect(ui.setWatch).not.toHaveBeenCalled();
    controller.hooks.unmount();
  });
  it("rejects errored or actively fetching lists, and handles outage without retries or mutation loop", async () => {
    visibleDocument();
    ui.watches.data.references = [props.reference];
    ui.watches.dataUpdatedAt = 100;
    ui.watches.isError = true;
    const controller = watchController();
    controller.render();
    expect(ui.checkWatched).not.toHaveBeenCalled();
    ui.watches.isError = false;
    ui.watches.isFetching = true;
    controller.render();
    expect(ui.checkWatched).not.toHaveBeenCalled();
    ui.watches.isFetching = false;
    ui.checkWatched.mockRejectedValue(new Error("outage"));
    controller.render();
    await flush();
    controller.hooks.replayEffects();
    await flush();
    expect(ui.checkWatched).toHaveBeenCalledOnce();
    expect(ui.watchesInvalidate).not.toHaveBeenCalled();
    controller.hooks.unmount();
  });
  it("keeps check gate interval and in-flight locks on replay", () => {
    const gate = createFlightCheckGate();
    expect(gate.begin(0, 100)).toBe(false);
    expect(gate.begin(1, 100)).toBe(true);
    expect(gate.begin(2, 500000)).toBe(false);
    gate.finish();
    expect(gate.begin(1, 500000)).toBe(false);
    expect(gate.begin(2, 299999)).toBe(false);
    expect(gate.begin(2, 300100)).toBe(true);
  });
});
