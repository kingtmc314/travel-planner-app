import type {
  AirportFlightObservation,
  FlightStatusRequest,
  FlightStatusResult,
} from "../shared/flightStatus";
import {
  normalizeFlightLookupNumber,
  validFlightLookupDate,
} from "../shared/flightLookup";
import { getHongKongDateInput } from "../shared/flightPassport";

const ENDPOINT =
  "https://www.hongkongairport.com/flightinfo-rest/rest/flights/past";
const CACHE_TTL = 3 * 60_000;
const FAILURE_TTL = 15_000;
const MAX_CACHE_ENTRIES = 50;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_SOURCE_AGE = 15 * 60_000;
const FUTURE_TOLERANCE = 2 * 60_000;
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type JsonObject = Record<string, unknown>;
type Envelope = {
  date: string;
  arrival: boolean;
  cargo: boolean;
  list: JsonObject[];
  lastUpdatedTime?: unknown;
};
type Dataset =
  | { ok: true; envelopes: Envelope[]; fetchedAt: number }
  | { ok: false; fetchedAt: number };
type CacheEntry = {
  expiresAt: number;
  pending: boolean;
  promise: Promise<Dataset>;
};
// Public airport datasets only: no user IDs, booking details, or per-user data.
const cache = new Map<string, CacheEntry>();

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDataset(value: unknown): Envelope[] {
  if (!Array.isArray(value)) throw new Error("Invalid airport dataset");
  for (const envelope of value) {
    if (
      !isObject(envelope) ||
      typeof envelope.date !== "string" ||
      !validFlightLookupDate(envelope.date) ||
      typeof envelope.arrival !== "boolean" ||
      typeof envelope.cargo !== "boolean" ||
      !Array.isArray(envelope.list)
    )
      throw new Error("Invalid airport envelope");
    for (const row of envelope.list) {
      if (
        !isObject(row) ||
        !Array.isArray(row.flight) ||
        row.flight.length === 0 ||
        !row.flight.every(
          flight =>
            isObject(flight) &&
            typeof flight.no === "string" &&
            flight.no.length <= 128
        )
      )
        throw new Error("Invalid airport flight list");
    }
  }
  return value as Envelope[];
}

/** Never let Date.parse repair an invalid date or interpret a local wall clock. */
function parseSourceTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!match || !validFlightLookupDate(match[1])) return null;
  const offset = match[5];
  if (offset !== "Z") {
    const [hours, minutes] = offset.slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null;
    // RFC 3339 -00:00 means an unknown local offset, not a known UTC instant.
    if (offset === "-00:00") return null;
  }
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 256 &&
    value.trim().length > 0
    ? value
    : null;
}

function classifyStatus(
  raw: string,
  direction: "arrival" | "departure"
): AirportFlightObservation["status"] {
  const text = raw.trim().toLowerCase();
  if (text === "scheduled") return "scheduled";
  if (text === "cancelled" || text === "canceled") return "cancelled";
  if (text === "delayed") return "delayed";
  if (direction === "departure" && text === "boarding") return "boarding";
  const departure = /^(?:dep|departed)(?: ([0-2]\d:[0-5]\d))?$/.exec(text);
  if (
    direction === "departure" &&
    departure &&
    (!departure[1] || CLOCK.test(departure[1]))
  )
    return "departed";
  const arrival = /^(?:arr|arrived|landed)(?: ([0-2]\d:[0-5]\d))?$/.exec(text);
  if (
    direction === "arrival" &&
    arrival &&
    (!arrival[1] || CLOCK.test(arrival[1]))
  )
    return "arrived";
  // Empty, estimated, gate-closed, and all unrecognized messages stay unknown.
  // statusCode is intentionally ignored: its meaning is not assumed.
  return "unknown";
}

function sourceUrl(date: string, arrival: boolean): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("date", date);
  url.searchParams.set("arrival", String(arrival));
  url.searchParams.set("cargo", "false");
  url.searchParams.set("lang", "en");
  return url.toString();
}

async function fetchDataset(url: string): Promise<Dataset> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async (): Promise<Dataset> => {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (controller.signal.aborted) throw new Error("Airport timeout");
    if (!response.ok || response.redirected)
      throw new Error("Airport unavailable");
    if (response.url && response.url !== url)
      throw new Error("Unexpected airport response URL");
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|\s*$)/i.test(
        contentType
      )
    )
      throw new Error("Non-JSON airport response");
    const length = response.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)
    )
      throw new Error("Oversized airport response");
    if (!response.body) throw new Error("Missing airport response body");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new Error("Airport timeout");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Oversized airport response");
      chunks.push(chunk.value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(combined);
    const envelopes = validateDataset(JSON.parse(text));
    return { ok: true, envelopes, fetchedAt: Date.now() };
  };
  try {
    // The race also bounds misbehaving fetch/stream implementations that ignore abort.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Airport timeout"));
      }, TIMEOUT_MS);
    });
    return await Promise.race([work(), timeout]);
  } catch {
    controller.abort();
    return { ok: false, fetchedAt: Date.now() };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (reader) void reader.cancel().catch(() => undefined);
  }
}

function getDataset(date: string, arrival: boolean): Promise<Dataset> {
  const key = `${date}:${arrival}`;
  const now = Date.now();
  for (const [entryKey, entry] of Array.from(cache.entries())) {
    if (!entry.pending && entry.expiresAt <= now) cache.delete(entryKey);
  }
  const existing = cache.get(key);
  if (existing) {
    // LRU reuse without restarting TTL. Pending fetches cannot be evicted.
    cache.delete(key);
    cache.set(key, existing);
    return existing.promise;
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const evictable = Array.from(cache.entries()).find(
      ([, entry]) => !entry.pending
    );
    if (!evictable) return Promise.resolve({ ok: false, fetchedAt: now });
    cache.delete(evictable[0]);
  }
  const entry: CacheEntry = {
    expiresAt: 0,
    pending: true,
    promise: Promise.resolve({ ok: false, fetchedAt: now }),
  };
  entry.promise = fetchDataset(sourceUrl(date, arrival)).then(dataset => {
    entry.pending = false;
    entry.expiresAt = Date.now() + (dataset.ok ? CACHE_TTL : FAILURE_TTL);
    return dataset;
  });
  cache.set(key, entry);
  return entry.promise;
}

/** Read-only, no-key Airport Authority Hong Kong / DATA.GOV.HK passenger dataset.
 * Date, direction, exact published flight number (including codeshares), and a
 * single source-published remote IATA code must all match. No tracker fallback.
 */
export async function getHkiaFlightStatus(
  input: FlightStatusRequest
): Promise<FlightStatusResult> {
  const validDate = validFlightLookupDate(input?.date);
  const arrival =
    typeof input?.toCode === "string" &&
    input.toCode.trim().toUpperCase() === "HKG";
  const url = validDate ? sourceUrl(input.date, arrival) : ENDPOINT;
  const result = (
    outcome: FlightStatusResult["outcome"],
    message: string,
    observation: AirportFlightObservation | null = null
  ): FlightStatusResult => ({
    outcome,
    observation,
    checkedAt: Date.now(),
    message,
    sourceUrl: url,
    experimentalRecentData:
      validDate && input.date >= getHongKongDateInput(new Date(Date.now())),
  });
  const flightNumber = normalizeFlightLookupNumber(input?.flightNumber);
  const fromCode =
    typeof input?.fromCode === "string"
      ? input.fromCode.trim().toUpperCase()
      : "";
  const toCode =
    typeof input?.toCode === "string" ? input.toCode.trim().toUpperCase() : "";
  if (
    !validDate ||
    !flightNumber ||
    !/^[A-Z]{3}$/.test(fromCode) ||
    !/^[A-Z]{3}$/.test(toCode) ||
    fromCode === toCode ||
    (fromCode !== "HKG" && toCode !== "HKG")
  )
    return result(
      "unsupported",
      "HKIA supports only valid, dated HKG-linked passenger flight routes."
    );

  const dataset = await getDataset(input.date, arrival);
  if (!dataset.ok)
    return result(
      "unavailable",
      "The official HKIA source is temporarily unavailable. No saved or inferred status is substituted."
    );
  const envelopes = dataset.envelopes.filter(
    envelope =>
      envelope.date === input.date &&
      envelope.arrival === arrival &&
      envelope.cargo === false
  );
  if (envelopes.length === 0)
    return result(
      "not_found",
      "No exact date and direction were returned by HKIA; adjacent dates are not used."
    );
  const remoteCode = arrival ? fromCode : toCode;
  const matches: { row: JsonObject; envelope: Envelope }[] = [];
  let ambiguousRoute = false;
  for (const envelope of envelopes) {
    for (const row of envelope.list) {
      const numbers = row.flight as JsonObject[];
      if (
        !numbers.some(
          flight =>
            normalizeFlightLookupNumber(flight.no as string) === flightNumber
        )
      )
        continue;
      const airports = row[arrival ? "origin" : "destination"];
      // The official source itself must publish one exact code. No city names,
      // substring matches, operator aliases, or first/last multileg selection.
      if (
        !Array.isArray(airports) ||
        airports.length !== 1 ||
        typeof airports[0] !== "string" ||
        !/^[A-Z]{3}$/.test(airports[0])
      ) {
        ambiguousRoute = true;
        continue;
      }
      if (airports[0] === remoteCode) matches.push({ row, envelope });
    }
  }
  if (ambiguousRoute || matches.length > 1)
    return result(
      "ambiguous",
      "HKIA returned multiple or unverified flight legs. No airport status was selected."
    );
  if (matches.length === 0)
    return result(
      "not_found",
      "No exact published flight number and route match was returned by HKIA."
    );
  const { row, envelope } = matches[0];
  const direction = arrival ? "arrival" : "departure";
  const sourceUpdatedAt = parseSourceTimestamp(envelope.lastUpdatedTime);
  const statusText = typeof row.status === "string" ? row.status : "";
  const scheduledTime =
    typeof row.time === "string" && CLOCK.test(row.time) ? row.time : null;
  const observation: AirportFlightObservation = {
    id: `hkia:${input.date}:${direction}:${flightNumber}:${fromCode}:${toCode}`,
    provider: "hkia",
    date: input.date,
    flightNumber,
    fromCode,
    toCode,
    direction,
    scheduledTime,
    status: classifyStatus(statusText, direction),
    statusText,
    gate: optionalText(row.gate),
    terminal: optionalText(row.terminal),
    checkInAisle: optionalText(row.aisle),
    baggageBelt: optionalText(row.baggage),
    sourceUpdatedAt,
    fetchedAt: dataset.fetchedAt,
  };
  const now = Date.now();
  // Re-evaluate the HK calendar and source age on every cache hit, including rollover.
  if (input.date < getHongKongDateInput(new Date(now)))
    return result(
      "stale",
      "Historical HKIA airport record, not a fresh flight event or live status.",
      observation
    );
  if (
    sourceUpdatedAt === null ||
    sourceUpdatedAt > now + FUTURE_TOLERANCE ||
    now - sourceUpdatedAt > MAX_SOURCE_AGE
  )
    return result(
      "stale",
      "The HKIA source timestamp is missing, invalid, future-dated, or older than 15 minutes. Not a fresh flight event.",
      observation
    );
  return result(
    "available",
    "Experimental recent HKIA airport-published data. Current/future dates exceed the documented previous-day guarantee; availability is not assured.",
    observation
  );
}
