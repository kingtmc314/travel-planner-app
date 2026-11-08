export type FlightReference = { kind: "trip" | "passport"; id: number };

export type FlightStatusRequest = {
  flightNumber: string;
  /** Exact Hong Kong airport calendar date, YYYY-MM-DD. */
  date: string;
  fromCode: string;
  toCode: string;
};

export type AirportFlightObservation = {
  id: string;
  provider: "hkia";
  date: string;
  flightNumber: string;
  fromCode: string;
  toCode: string;
  direction: "arrival" | "departure";
  /** Airport-published HH:mm clock in Hong Kong, not an inferred instant or ETA. */
  scheduledTime: string | null;
  status:
    | "scheduled"
    | "boarding"
    | "departed"
    | "arrived"
    | "delayed"
    | "cancelled"
    | "unknown";
  /** Verbatim airport status; render as text, never HTML. */
  statusText: string;
  gate: string | null;
  terminal: string | null;
  checkInAisle: string | null;
  baggageBelt: string | null;
  /** UTC epoch milliseconds, parsed only from an explicit source timezone. */
  sourceUpdatedAt: number | null;
  /** UTC epoch milliseconds of the actual fetch, including cache hits. */
  fetchedAt: number;
};

export type FlightStatusResult = {
  /** Only available may represent fresh data. Historical/stale observations are informational. */
  outcome:
    | "available"
    | "not_found"
    | "unsupported"
    | "unavailable"
    | "ambiguous"
    | "stale";
  observation: AirportFlightObservation | null;
  checkedAt: number;
  message: string;
  sourceUrl: string;
  /** Current/future-day records exceed the source's documented previous-day guarantee. */
  experimentalRecentData: boolean;
};
