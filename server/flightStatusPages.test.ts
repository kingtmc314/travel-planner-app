import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { data: { id: 7 } as any, isError: false },
  trip: {
    data: {
      id: 2,
      userRole: "viewer",
      startDate: "2026-11-08",
      endDate: "2026-11-10",
    } as any,
    isError: false,
  },
  tripFlights: [] as any[],
  passportFlights: [] as any[],
  cards: [] as any[],
  editing: null as any,
  stateIndex: 0,
  mutate: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: any) => {
      const index = state.stateIndex++;
      return actual.useState(
        state.editing && index === 1 ? state.editing : initial
      );
    },
  };
});
vi.mock("@/hooks/useI18n", () => ({
  useI18n: () => ({ lang: "en", t: (key: string) => key }),
}));
vi.mock("@/hooks/useFlightAutofill", () => ({
  useFlightAutofill: () => ({
    change: vi.fn(),
    applyCandidate: vi.fn(),
    canManage: () => false,
    trackEstimate: vi.fn(),
  }),
}));
vi.mock("@/components/FlightStatusCard", () => ({
  default: (props: any) => {
    state.cards.push(props);
    return createElement(
      "div",
      {
        "data-flight-status": props.reference.id,
        "data-authorized": props.authorized,
      },
      "Collapsed source status"
    );
  },
}));
vi.mock("@/components/BookingImportDialog", () => ({ default: () => null }));
vi.mock("@/components/FlightLookupPanel", () => ({ default: () => null }));
vi.mock("@/components/WorldMap", () => ({ default: () => null }));
vi.mock("@/components/PassportInsights", () => ({ default: () => null }));
vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: any) => createElement("main", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant, size, ...props }: any) =>
    createElement("button", props, children),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => createElement("input", props),
}));
vi.mock("@/components/ui/dialog", () => {
  const div = ({ children }: any) => createElement("div", null, children);
  return {
    Dialog: ({ open, children }: any) =>
      open ? createElement("div", null, children) : null,
    DialogContent: div,
    DialogHeader: div,
    DialogDescription: div,
    DialogTitle: div,
  };
});
vi.mock("@/components/ui/tabs", () => {
  const div = ({ children }: any) => createElement("div", null, children);
  return { Tabs: div, TabsContent: div, TabsList: div, TabsTrigger: div };
});
vi.mock("@/components/ui/select", () => {
  const div = ({ children }: any) => createElement("div", null, children);
  return {
    Select: div,
    SelectContent: div,
    SelectItem: div,
    SelectTrigger: div,
    SelectValue: div,
  };
});
vi.mock("@/lib/trpc", () => {
  const query = (path: string) => {
    const defaults = {
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
    switch (path) {
      case "auth.me":
        return { ...defaults, ...state.auth };
      case "trips.get":
        return { ...defaults, ...state.trip };
      case "flights.list":
        return { ...defaults, data: state.tripFlights };
      case "passport.getFlights":
        return { ...defaults, data: state.passportFlights };
      default:
        return { ...defaults, data: [] };
    }
  };
  const route = (path = ""): any =>
    new Proxy(() => {}, {
      get: (_, name: string) => {
        if (name === "useUtils")
          return () => ({ invalidate: state.invalidate });
        if (name === "useQuery") return () => query(path);
        if (name === "useMutation")
          return () => ({
            isPending: false,
            mutate: state.mutate,
            reset: vi.fn(),
            data: undefined,
          });
        return route(path ? `${path}.${name}` : name);
      },
    });
  return { trpc: route() };
});
import FlightsPage from "../client/src/pages/trip/FlightsPage";
import FlightPassport from "../client/src/pages/FlightPassport";

const tripFlight = {
  id: 11,
  tripId: 2,
  flightNumber: "CX543",
  fromCode: "HKG",
  toCode: "HND",
  date: "2026-11-08",
  departTime: "09:35",
  arriveTime: "14:30",
  type: "outbound",
  notes: "Keep my booking notes\n[voyageai:booking:private-marker]",
};
const passportFlight = {
  id: 19,
  userId: 7,
  flightNumber: "CX543",
  departureAirport: "HKG",
  arrivalAirport: "HND",
  flightDate: new Date("2026-11-08T00:00:00+08:00"),
  flightYear: 2026,
  notes: "Keep my passport notes",
  durationMinutes: 180,
  distanceKm: 2800,
};
const tripHtml = () =>
  renderToStaticMarkup(createElement(FlightsPage, { tripId: 2 }));
const passportHtml = () => renderToStaticMarkup(createElement(FlightPassport));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  state.cards = [];
  state.editing = null;
  state.stateIndex = 0;
  state.auth = { data: { id: 7 }, isError: false };
  state.trip = {
    data: {
      id: 2,
      userRole: "viewer",
      startDate: "2026-11-08",
      endDate: "2026-11-10",
    },
    isError: false,
  };
  state.tripFlights = [{ ...tripFlight }];
  state.passportFlights = [{ ...passportFlight }];
});
afterEach(() => vi.unstubAllGlobals());

describe("existing saved-flight status integration privacy", () => {
  it("read-only trip viewers can view and opt in for themselves without booking edit controls", () => {
    const html = tripHtml();
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      reference: { kind: "trip", id: 11 },
      authorized: true,
      date: "2026-11-08",
      fromCode: "HKG",
      toCode: "HND",
    });
    expect(html).toContain("09:35");
    expect(html).toContain("14:30");
    expect(html).toContain("Keep my booking notes");
    expect(html).not.toContain("private-marker");
    expect(html).toContain("Read-only member");
    expect(html).not.toContain(">Duplicate<");
    expect(html).not.toContain(">Add return<");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it.each(["guest", "auth-error", "trip-error", "changed-trip", "no-role"])(
    "blocks status authorization for %s",
    failure => {
      if (failure === "guest") state.auth.data = null;
      if (failure === "auth-error") state.auth.isError = true;
      if (failure === "trip-error") state.trip.isError = true;
      if (failure === "changed-trip") state.trip.data.id = 99;
      if (failure === "no-role") state.trip.data.userRole = null;
      tripHtml();
      expect(state.cards[0].authorized).toBe(false);
      expect(state.mutate).not.toHaveBeenCalled();
    }
  );
  it("passport status only receives an authenticated user's own saved record", () => {
    const html = passportHtml();
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0]).toMatchObject({
      reference: { kind: "passport", id: 19 },
      authorized: true,
      date: "2026-11-08",
    });
    expect(html).toContain("Keep my passport notes");
    expect(html).toContain("3h 0m");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it.each(["foreign", "guest", "auth-error"])(
    "passport status is not authorized for %s records",
    failure => {
      if (failure === "foreign") state.passportFlights[0].userId = 55;
      if (failure === "guest") state.auth.data = null;
      if (failure === "auth-error") state.auth.isError = true;
      passportHtml();
      expect(state.cards[0].authorized).toBe(false);
      expect(state.mutate).not.toHaveBeenCalled();
    }
  );
  it("passport detail uses the existing saved reference and never the editable booking form", () => {
    state.editing = { ...passportFlight };
    const html = passportHtml();
    expect(state.cards).toHaveLength(2);
    expect(state.cards[1]).toMatchObject({
      reference: { kind: "passport", id: 19 },
      flightNumber: "CX543",
      fromCode: "HKG",
      toCode: "HND",
      authorized: true,
    });
    expect(html).toContain("editFlightRecord");
    expect(html).toContain("passport-notes");
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
