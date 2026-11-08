import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  FlightLookupCandidate,
  FlightLookupResult,
} from "../shared/flightLookup";
import {
  applyFlightAutofillValues,
  candidateMatchesFlight,
  canApplyFlightCandidate,
  clearFlightAutofillIdentity,
  createFlightAutofillState,
  flightAutofillIdentity,
  flightLookupInput,
  markFlightAutofillManual,
  useFlightAutofill,
} from "../client/src/hooks/useFlightAutofill";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
import FlightLookupPanel, {
  FlightLookupPanelView,
} from "../client/src/components/FlightLookupPanel";

const candidate: FlightLookupCandidate = {
  id: "trip:1:flight:9",
  flightNumber: "CX543",
  date: "2026-11-08",
  airline: "Cathay Pacific",
  fromCode: "HKG",
  fromCity: "Hong Kong",
  toCode: "HND",
  toCity: "Tokyo",
  departTime: "08:10",
  arriveTime: "12:50",
  durationMinutes: 220,
  distanceKm: null,
  source: "trip",
  sourceLabel: "Japan trip",
};
const blank = () => ({
  flightNumber: "CX543",
  date: "2026-11-08",
  airline: "",
  fromCode: "",
  toCode: "",
  departTime: "",
  duration: "",
  notes: "",
  type: "outbound",
});
const state = () =>
  createFlightAutofillState(flightAutofillIdentity("CX543", "2026-11-08"));
const result = (candidates: FlightLookupCandidate[]): FlightLookupResult => ({
  flightNumber: "CX543",
  date: "2026-11-08",
  candidates,
  providerConfigured: false,
  onlineStatus: "not_configured",
  status:
    candidates.length > 1
      ? "ambiguous"
      : candidates.length
        ? "matched"
        : "not_found",
  warnings: [],
});

describe("flight autofill input and stale-response guards", () => {
  it("canonicalizes valid numbers and strictly validates calendar dates", () => {
    expect(flightLookupInput(" cx 543 ", "2026-11-08")).toEqual({
      flightNumber: "CX543",
      date: "2026-11-08",
    });
    expect(flightLookupInput("CX", "2026-11-08")).toBeNull();
    expect(flightLookupInput("CX543", "2026-02-29")).toBeNull();
    expect(flightLookupInput("CX543", "2028-02-29")).not.toBeNull();
    expect(flightLookupInput("CX543", "")).toBeNull();
  });
  it("never uses another number or date", () => {
    expect(candidateMatchesFlight(candidate, "cx 543", "2026-11-08")).toBe(
      true
    );
    expect(candidateMatchesFlight(candidate, "CX543", "2026-11-09")).toBe(
      false
    );
    expect(candidateMatchesFlight(candidate, "CX544", "2026-11-08")).toBe(
      false
    );
    expect(candidateMatchesFlight(candidate, "CX", "2026-11-08")).toBe(false);
  });
  it("rejects closed, unauthorized, changed identity and new-dialog/new-trip sessions", () => {
    const context = {
      flightNumber: "CX543",
      date: "2026-11-08",
      open: true,
      authorized: true,
      sessionKey: "trip:1:2",
    };
    expect(canApplyFlightCandidate(candidate, context, "trip:1:2")).toBe(true);
    expect(
      canApplyFlightCandidate(
        candidate,
        { ...context, open: false },
        "trip:1:2"
      )
    ).toBe(false);
    expect(
      canApplyFlightCandidate(
        candidate,
        { ...context, authorized: false },
        "trip:1:2"
      )
    ).toBe(false);
    expect(
      canApplyFlightCandidate(
        candidate,
        { ...context, date: "2026-11-09" },
        "trip:1:2"
      )
    ).toBe(false);
    expect(
      canApplyFlightCandidate(
        candidate,
        { ...context, sessionKey: "trip:1:3" },
        "trip:1:2"
      )
    ).toBe(false);
    expect(
      canApplyFlightCandidate(
        candidate,
        { ...context, sessionKey: "trip:2:2" },
        "trip:1:2"
      )
    ).toBe(false);
  });
});

describe("flight autofill manual protection", () => {
  it("replays actual hook updaters twice with the same previous form without resurrecting old auto fields", () => {
    let committed = blank();
    const replays: { first: typeof committed; second: typeof committed }[] = [];
    let hook!: ReturnType<typeof useFlightAutofill<typeof committed>>;
    const setForm: React.Dispatch<
      React.SetStateAction<typeof committed>
    > = action => {
      if (typeof action !== "function") {
        committed = action;
        return;
      }
      const previous = committed;
      const first = action(previous);
      const second = action(previous);
      replays.push({ first, second });
      committed = second;
    };
    function HookHarness() {
      hook = useFlightAutofill({
        form: committed,
        setForm,
        numberField: "flightNumber",
        dateField: "date",
        sessionKey: "strict-replay:1",
        open: true,
        authorized: true,
        mapCandidate: record => ({
          fromCode: record.fromCode,
          toCode: record.toCode,
          departTime: record.departTime,
        }),
      });
      return null;
    }
    renderToStaticMarkup(React.createElement(HookHarness));
    hook.applyCandidate(candidate);
    expect(committed).toMatchObject({
      fromCode: "HKG",
      toCode: "HND",
      departTime: "08:10",
    });
    hook.change("airline", "My manual airline");
    hook.change("flightNumber", "ZZ9876");
    expect(committed).toMatchObject({
      flightNumber: "ZZ9876",
      airline: "My manual airline",
      fromCode: "",
      toCode: "",
      departTime: "",
    });
    for (const replay of replays) expect(replay.second).toEqual(replay.first);
  });

  it("fills only blank values and never changes protected flight identity, notes or type", () => {
    const form = blank();
    const filled = applyFlightAutofillValues(
      form,
      state(),
      {
        airline: "Cathay Pacific",
        fromCode: "HKG",
        toCode: "HND",
        flightNumber: "CX999",
        date: "2026-11-09",
      },
      ["flightNumber", "date"]
    );
    expect(filled.form).toMatchObject({
      flightNumber: "CX543",
      date: "2026-11-08",
      airline: "Cathay Pacific",
      fromCode: "HKG",
      toCode: "HND",
      notes: "",
      type: "outbound",
    });
    expect(form).toEqual(blank());
    expect(filled.filled).toEqual(["airline", "fromCode", "toCode"]);
  });
  it("preserves all prefilled edit, duplicate and return fields", () => {
    const form = {
      ...blank(),
      airline: "My airline",
      fromCode: "NRT",
      toCode: "HKG",
      departTime: "23:40",
      duration: "4h",
      notes: "Keep notes",
      type: "return",
    };
    expect(
      applyFlightAutofillValues(form, state(), {
        airline: "Cathay",
        fromCode: "HKG",
        toCode: "HND",
        departTime: "08:10",
        duration: "3h",
      }).form
    ).toEqual(form);
  });
  it("updates only still-managed automatic values", () => {
    const first = applyFlightAutofillValues(blank(), state(), {
      fromCode: "HKG",
      toCode: "HND",
    });
    const second = applyFlightAutofillValues(first.form, first.state, {
      fromCode: "TPE",
      toCode: "NRT",
    });
    expect(second.form).toMatchObject({ fromCode: "TPE", toCode: "NRT" });
  });
  it("respects manual changes including a deliberate clear, even without an explicit dirty marker", () => {
    const first = applyFlightAutofillValues(blank(), state(), {
      fromCode: "HKG",
      departTime: "08:10",
    });
    const manuallyChanged = { ...first.form, fromCode: "TPE", departTime: "" };
    const filled = applyFlightAutofillValues(manuallyChanged, first.state, {
      fromCode: "HKG",
      departTime: "09:00",
    });
    expect(filled.form).toMatchObject({ fromCode: "TPE", departTime: "" });
    expect(filled.state.dirty).toContain("departTime");
    const reverted = { ...filled.form, fromCode: "HKG" };
    expect(
      applyFlightAutofillValues(reverted, filled.state, { fromCode: "NRT" })
        .form.fromCode
    ).toBe("HKG");
  });
  it("protects manually emptied initially blank fields", () => {
    const dirty = markFlightAutofillManual(state(), "airline");
    expect(
      applyFlightAutofillValues(blank(), dirty, { airline: "Cathay Pacific" })
        .form.airline
    ).toBe("");
  });
  it("clears only unchanged auto-managed fields on identity change, not manual data or existing presets", () => {
    const first = applyFlightAutofillValues(
      { ...blank(), airline: "Preset" },
      state(),
      { fromCode: "HKG", toCode: "HND", departTime: "08:10", duration: "3h" }
    );
    const dirty = markFlightAutofillManual(first.state, "toCode");
    const changed = {
      ...first.form,
      flightNumber: "CX544",
      toCode: "NRT",
      departTime: "",
    };
    const cleared = clearFlightAutofillIdentity(
      changed,
      dirty,
      flightAutofillIdentity("CX544", "2026-11-08")
    );
    expect(cleared.form).toMatchObject({
      flightNumber: "CX544",
      airline: "Preset",
      fromCode: "",
      toCode: "NRT",
      departTime: "",
      duration: "",
    });
    expect(cleared.state.lastAuto).toEqual({});
    expect(cleared.state.dirty).toContain("departTime");
    expect(cleared.state.dirty).toContain("toCode");
  });
  it("treats invalid intermediate input as a new identity but equivalent formatting as the same flight", () => {
    const first = applyFlightAutofillValues(blank(), state(), {
      fromCode: "HKG",
      departTime: "08:10",
    });
    expect(
      clearFlightAutofillIdentity(
        first.form,
        first.state,
        flightAutofillIdentity(" cx 543 ", "2026-11-08")
      ).form.fromCode
    ).toBe("HKG");
    expect(
      clearFlightAutofillIdentity(
        first.form,
        first.state,
        flightAutofillIdentity("CX", "2026-11-08")
      ).form
    ).toMatchObject({ fromCode: "", departTime: "" });
  });
  it("a fresh session cannot clear values owned by an old form session", () => {
    const old = applyFlightAutofillValues(blank(), state(), {
      fromCode: "HKG",
    });
    const fresh = createFlightAutofillState(
      flightAutofillIdentity("CX543", "2026-11-08")
    );
    expect(
      clearFlightAutofillIdentity(
        old.form,
        fresh,
        flightAutofillIdentity("CX999", "2026-11-08")
      ).form.fromCode
    ).toBe("HKG");
  });
});

describe("flight lookup panel SSR (no RPC, database or network)", () => {
  const render = (
    props: Partial<React.ComponentProps<typeof FlightLookupPanelView>> = {}
  ) =>
    renderToStaticMarkup(
      React.createElement(FlightLookupPanelView, {
        lang: "en",
        valid: true,
        onRefresh: vi.fn(),
        onApply: vi.fn(),
        ...props,
      })
    );
  it("always makes the API limitation and non-live saved provenance clear", () => {
    const html = render({ result: result([candidate]) });
    expect(html).toContain("No aviation data API is configured");
    expect(html).toContain("Authoritative online schedules, gates and delays");
    expect(html).toContain("Accessible trip record");
    expect(html).toContain("Japan trip");
    expect(html).toContain("not live");
    expect(html).toContain("Choose &amp; fill");
    expect(html).toContain('type="button"');
    expect(html).toContain("450 ms");
  });
  it("multiple candidates require an explicit choice", () => {
    const html = render({
      result: result([
        candidate,
        { ...candidate, id: "trip:2:flight:4", toCode: "NRT" },
      ]),
    });
    expect(html).toContain("Choose one explicitly");
    expect(html.match(/Choose &amp; fill/g)).toHaveLength(2);
    expect(html).not.toContain("Available fields filled where permitted");
  });
  it("renders Traditional Chinese, loading, not-found, manual protection and graceful errors", () => {
    expect(render({ lang: "zh", result: result([]) })).toContain(
      "找不到相同號碼及日期"
    );
    expect(render({ lang: "zh", result: result([]) })).toContain(
      "權威線上航班時刻、閘口及延誤"
    );
    expect(render({ loading: true })).toContain(
      "Looking up exact saved matches"
    );
    expect(render({ error: "Temporary failure" })).toContain(
      "Refresh or enter details manually"
    );
    expect(render({ error: "Temporary failure" })).toContain('role="alert"');
    expect(
      render({ appliedId: candidate.id, result: result([candidate]) })
    ).toContain("Existing and manually edited values are unchanged");
    expect(render({ valid: false })).toContain("Enter a valid flight number");
  });
  it("escapes untrusted source labels and messages", () => {
    expect(
      render({
        result: result([{ ...candidate, sourceLabel: "<script>bad</script>" }]),
      })
    ).toContain("&lt;script&gt;");
    expect(render({ error: "<img onerror=bad>" })).not.toContain("<img");
  });
  it("does not even mount RPC hooks for closed or unauthorized dialogs", () => {
    const props = {
      flightNumber: "CX543",
      date: "2026-11-08",
      sessionKey: "test:1",
      open: false,
      authorized: true,
      lang: "en" as const,
      onApply: vi.fn(),
    };
    expect(
      renderToStaticMarkup(React.createElement(FlightLookupPanel, props))
    ).toBe("");
    expect(
      renderToStaticMarkup(
        React.createElement(FlightLookupPanel, {
          ...props,
          open: true,
          authorized: false,
        })
      )
    ).toBe("");
  });
});
